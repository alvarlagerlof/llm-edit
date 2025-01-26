import { Levenshtein } from "autoevals";
import { createScorer } from "evalite";
import { writeFile, mkdtemp, readdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { check, format } from "prettier";
import { ESLint } from "eslint";
import { getCurrentModel } from "../models";
import { generateObject } from "ai";
import { z } from "zod";

const prettierOptions = {
  printWidth: 100,
  trailingComma: "all",
  singleQuote: true,
  semi: false,
} as const;

export type MemoryFileSystem = Record<string, string>;

export type EvalInput = { prompt: string; memoryFileSystem: MemoryFileSystem };
export type EvalOutput = { memoryFileSystem: MemoryFileSystem };

export async function createMemoryFileSystem(
  memoryFileSystem: MemoryFileSystem,
  {
    formatFiles,
    addEslintConfig,
  }: {
    formatFiles: boolean;
    addEslintConfig: boolean;
  }
) {
  if (addEslintConfig) {
    memoryFileSystem["eslint.config.js"] = `
    export default [
      {
          rules: {
              semi: "error",
              "prefer-const": "error"
          }
      }
    ];`;
  }

  if (formatFiles) {
    for (const [fileName, fileContent] of Object.entries(memoryFileSystem)) {
      memoryFileSystem[fileName] = await format(fileContent, {
        ...prettierOptions,
        filepath: fileName,
      });
    }
  }

  return memoryFileSystem;
}

export async function createTemporaryFileSystem() {
  const workingDirectory = await mkdtemp(
    join(tmpdir(), `ai-edit-eval-${Math.random()}-${Date.now()}`)
  );

  function hydrateMemoryFileSystem(memoryFileSystem: MemoryFileSystem) {
    for (const [fileName, fileContent] of Object.entries(memoryFileSystem)) {
      const filePath = join(workingDirectory, fileName);
      writeFile(filePath, fileContent);
    }
  }

  async function readToMemoryFileSystem() {
    const memoryFileSystem: MemoryFileSystem = {};
    const files = await readdir(workingDirectory, {
      withFileTypes: true,
      recursive: true,
    });

    for await (const file of files) {
      const filePath = join(file.parentPath, file.name);
      const fileContent = await readFile(filePath, "utf-8");
      memoryFileSystem[filePath.replace(workingDirectory, "").substring(1)] =
        fileContent;
    }

    return memoryFileSystem;
  }

  return {
    workingDirectory,
    hydrateMemoryFileSystem,
    readToMemoryFileSystem,
  };
}

export const LevenshteinMultiFile = createScorer<EvalInput, EvalOutput>({
  name: "Levenshtein",
  description:
    "A simple scorer that uses the Levenshtein distance to compare two file systems.",
  scorer: async ({ output, expected }) => {
    if (!expected) {
      return {
        score: 0,
        metadata: {
          error: "Expected is not defined",
        },
      };
    }

    const scores: Record<string, { score: number; meta: any }> = {};

    for (const [outputFileName, outputText] of Object.entries(
      output.memoryFileSystem
    )) {
      if (!expected.memoryFileSystem[outputFileName]) {
        scores[outputFileName] = {
          score: 0,
          meta: `Expected file ${outputFileName} not found`,
        };
        continue;
      }
      const score = await Levenshtein({
        output: outputText,
        expected: expected.memoryFileSystem[outputFileName],
      });
      if (!score.score) {
        scores[outputFileName] = {
          score: 0,
          meta: `Score for ${outputFileName} is not defined`,
        };
        continue;
      }

      scores[outputFileName] = {
        score: score.score,
        meta: null,
      };
    }

    return {
      score:
        Object.values(scores)
          .map((value) => value.score)
          .reduce((a, b) => a + b, 0) / Object.keys(scores).length,
      metadata: {
        ...scores,
      },
    };
  },
});

export const PrettierMultiFile = createScorer<EvalInput, EvalOutput>({
  name: "Prettier",
  description:
    "A simple scorer checks if the output file system is correctly formatted according to Prettier.",
  scorer: async ({ output }) => {
    const scores: Record<string, { score: number; meta: string | null }> = {};

    for (const [outputFileName, outputText] of Object.entries(
      output.memoryFileSystem
    )) {
      try {
        const valid = await check(outputText, {
          ...prettierOptions,
          filepath: outputFileName,
        });
        scores[outputFileName] = { score: valid ? 1 : 0, meta: null };
      } catch (error) {
        if (error instanceof Error) {
          scores[outputFileName] = {
            score: 0,
            meta: `${error.name}: ${error.message}`,
          };
        }
        scores[outputFileName] = { score: 0, meta: String(error) };
      }
    }

    return {
      score:
        Object.values(scores)
          .map((value) => value.score)
          .reduce((a, b) => a + b, 0) / Object.keys(scores).length,
      metadata: {
        ...scores,
      },
    };
  },
});

export const ESLintMultiFile = createScorer<EvalInput, EvalOutput>({
  name: "ESLint",
  description:
    "A simple scorer checks if the output file system is correctly formatted according to ESLint.",
  scorer: async ({ output }) => {
    const scores: Record<string, { score: number; meta: any }> = {};

    for (const [outputFileName, outputText] of Object.entries(
      output.memoryFileSystem
    )) {
      try {
        const eslint = new ESLint({
          baseConfig: {},
          overrideConfigFile: true,
        });
        const report = await eslint.lintText(outputText, {});
        if (report.length !== 1) {
          scores[outputFileName] = {
            score: 0,
            meta: `Unexpected report length: ${report.length}`,
          };
          continue;
        }
        const reportItem = report[0];
        if (reportItem.errorCount > 0) {
          scores[outputFileName] = {
            score: 0,
            meta: reportItem.messages,
          };
          continue;
        }
        scores[outputFileName] = { score: 1, meta: null };
      } catch (error) {
        if (error instanceof Error) {
          scores[outputFileName] = {
            score: 0,
            meta: `${error.name}: ${error.message}`,
          };
        }
        scores[outputFileName] = { score: 0, meta: String(error) };
      }
    }

    return {
      score:
        Object.values(scores)
          .map((value) => value.score)
          .reduce((a, b) => a + b, 0) / Object.keys(scores).length,
      metadata: {
        ...scores,
      },
    };
  },
});

export const LLMPromptInputOutputEvaluatorMultiFile = createScorer<
  EvalInput,
  EvalOutput
>({
  name: "LLM",
  description:
    "A simple scorer checks the output file system matches the goals set in the prompt.",
  scorer: async ({ input, output }) => {
    function printMemoryFileSystem(memoryFileSystem: MemoryFileSystem) {
      let printedOutputFileSystem = "";

      for (const [outputFileName, outputText] of Object.entries(
        output.memoryFileSystem
      )) {
        printedOutputFileSystem +=
          outputFileName +
          "\n" +
          outputText +
          "\n\n---------------------------------------------\n\n";
      }

      return printedOutputFileSystem;
    }

    const model = getCurrentModel();

    try {
      const {
        object: { score, reasoning },
      } = await generateObject({
        model,
        system: `
          You are a careful and critical LLM agent reviewer, ensuring quality of output.

          You will receive a prompt, input and output files.
          Give a score 1-100 for how well the prompt is solved for in the output files based these factors:
          - How well the output matches the goal of the prompt.
          - Correctness of the output.
          - Syntax errors in the output.
          - Likelihood of the output to be executable (if it is code).
          - Unrelated files should not be changed.

          When there is any issue that leads the the goal not being achieved, lower the score dramatically (below 50 is fine)

          Also give your reasoning for the score, explaining why you think the score is what it is. This is important.

          call the tool!
          {
            "reasoning": "The reasoning for the score",
            "score": 20
          }
        `,
        prompt: `
          prompt: ${input.prompt}

          input files:
          ${printMemoryFileSystem(input.memoryFileSystem)}

          output files:
          ${printMemoryFileSystem(output.memoryFileSystem)}
        `,
        schema: z.object({
          score: z.number(),
          reasoning: z.string(),
        }),
        maxRetries: 3,
      });
      return {
        score: score / 100,
        metadata: {
          reasoning,
        },
      };
    } catch (error) {
      console.error(error);
      if (error instanceof Error) {
        return {
          score: 0,
          metadata: {
            error: `${error.name}: ${error.message}`,
          },
        };
      }
      return {
        score: 0,
        metadata: {
          error: String(error),
        },
      };
    }
  },
});
