import { Levenshtein } from "autoevals";
import { createScorer, type Evalite } from "evalite";
import { writeFile, mkdtemp, readdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { check, format } from "prettier";
import { ESLint } from "eslint";
import { getCurrentModel } from "../models";
import { generateObject } from "ai";
import { z } from "zod";
import { aiEdit } from "..";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import { pathToFolder } from "../files";
import { mkdir } from "fs/promises";
import { createKvFileCache } from "../kv-file-cache";
import { inferenceOptionsAsyncLocalStorage } from "../inferenceOptionsAsyncLocalStorage";

const prettierOptions = {
  printWidth: 100,
  trailingComma: "all",
  singleQuote: true,
  semi: false,
} as const;

export type MemoryFileSystem = Record<string, string>;

export type EvalInput = {
  prompt: string;
  inferenceOptions: NonNullable<
    ReturnType<typeof inferenceOptionsAsyncLocalStorage.getStore>
  >;
  memoryFileSystem: MemoryFileSystem;
};
export type EvalExpected = {
  memoryFileSystem: MemoryFileSystem;
};

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
    memoryFileSystem["eslint.config.js"] = `export default [
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
      if (fileName.endsWith(".env")) {
        continue;
      }

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

  async function hydrateMemoryFileSystem(memoryFileSystem: MemoryFileSystem) {
    for (const [fileName, fileContent] of Object.entries(memoryFileSystem)) {
      const filePath = join(workingDirectory, fileName);

      const folder = pathToFolder(filePath) + "/";
      await mkdir(folder, { recursive: true });

      await writeFile(filePath, fileContent);
    }
  }

  async function readToMemoryFileSystem() {
    const memoryFileSystem: MemoryFileSystem = {};
    const files = await readdir(workingDirectory, {
      withFileTypes: true,
      recursive: true,
    });

    for await (const file of files.filter((dirent) => dirent.isFile())) {
      const filePath = join(file.parentPath, file.name);

      try {
        const fileContent = await readFile(filePath, "utf-8");
        memoryFileSystem[filePath.replace(workingDirectory, "").substring(1)] =
          fileContent;
      } catch (error) {
        console.error("Error in readToMemoryFileSystem", error);
      }
    }

    return memoryFileSystem;
  }

  return {
    workingDirectory,
    hydrateMemoryFileSystem,
    readToMemoryFileSystem,
  };
}

export async function runEvalTask(input: EvalInput) {
  const temporaryFileSystem = await createTemporaryFileSystem();
  await temporaryFileSystem.hydrateMemoryFileSystem(input.memoryFileSystem);

  await inferenceOptionsAsyncLocalStorage.run(
    input.inferenceOptions,
    async () => {
      await aiEdit({
        folder: temporaryFileSystem.workingDirectory,
        prompt: input.prompt,
      });
    }
  );

  return {
    memoryFileSystem: await temporaryFileSystem.readToMemoryFileSystem(),
  };
}

export const LevenshteinMultiFile = createScorer<EvalInput, EvalExpected>({
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

    const scores: Record<string, { score: number; error?: any }> = {};

    for (const [outputFileName, outputText] of Object.entries(
      output.memoryFileSystem
    )) {
      if (!expected.memoryFileSystem[outputFileName]) {
        scores[outputFileName] = {
          score: 0,
          error: `Expected file ${outputFileName} not found`,
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
          error: `Score for ${outputFileName} is not defined`,
        };
        continue;
      }

      scores[outputFileName] = {
        score: score.score,
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

const prettierCache = createKvFileCache({
  name: "prettier-cache",
});

export const PrettierMultiFile = createScorer<EvalInput, EvalExpected>({
  name: "Prettier",
  description:
    "Checks if the output file system is correctly formatted according to Prettier.",
  scorer: async ({ output }) => {
    const prettierCacheKey = JSON.stringify({ output, prettierOptions });

    const cached = (await prettierCache.get(
      prettierCacheKey
    )) as Evalite.UserProvidedScoreWithMetadata;

    if (cached) {
      return cached;
    }

    const scores: Record<string, { score: number; error?: any }> = {};

    for (const [outputFileName, outputText] of Object.entries(
      output.memoryFileSystem
    )) {
      if (outputFileName.endsWith(".env")) {
        scores[outputFileName] = { score: 1, error: "Ignored file type" };
        continue;
      }

      try {
        const valid = await check(outputText, {
          ...prettierOptions,
          filepath: outputFileName,
        });
        scores[outputFileName] = { score: valid ? 1 : 0 };
      } catch (error) {
        if (error instanceof Error) {
          scores[outputFileName] = {
            score: 0,
            error: `${error.name}: ${error.message}`,
          };
        }
        scores[outputFileName] = { score: 0, error: String(error) };
      }
    }

    const result = {
      score:
        Object.values(scores)
          .map((value) => value.score)
          .reduce((a, b) => a + b, 0) / Object.keys(scores).length,
      metadata: {
        ...scores,
      },
    };

    await prettierCache.set(prettierCacheKey, result);

    return result;
  },
});

const eslintCache = createKvFileCache({
  name: "eslint-cache",
});

export const ESLintMultiFile = createScorer<EvalInput, EvalExpected>({
  name: "ESLint",
  description:
    "Checks if the output file system is correctly formatted according to ESLint.",
  scorer: async ({ output }) => {
    const eslintOptions: ESLint.Options = {
      baseConfig: {},
      overrideConfigFile: true,
      // @ts-expect-error Types complain, but it works.
      overrideConfig: tseslint.config(
        eslint.configs.recommended,
        tseslint.configs.recommended,
        {
          languageOptions: {
            globals: {
              ...globals.node,
            },
          },
        }
      ),
    };

    const eslintCacheKey = JSON.stringify({ output, eslintOptions });

    const cached = (await eslintCache.get(
      eslintCacheKey
    )) as Evalite.UserProvidedScoreWithMetadata;

    if (cached) {
      return cached;
    }

    const scores: Record<string, { score: number; error?: any }> = {};

    for (const [outputFileName, outputText] of Object.entries(
      output.memoryFileSystem
    )) {
      if (outputFileName.endsWith(".md") || outputFileName.endsWith(".json")) {
        scores[outputFileName] = { score: 1, error: "Ignored file type" };
        continue;
      }

      try {
        const eslintInstance = new ESLint(eslintOptions);
        const report = await eslintInstance.lintText(outputText, {});
        if (report.length !== 1) {
          scores[outputFileName] = {
            score: 0,
            error: `Unexpected report length: ${report.length}`,
          };
          continue;
        }
        const reportItem = report[0];
        if (reportItem.errorCount > 0) {
          scores[outputFileName] = {
            score: 0,
            error: reportItem.messages,
          };
          continue;
        }
        scores[outputFileName] = { score: 1 };
      } catch (error) {
        if (error instanceof Error) {
          scores[outputFileName] = {
            score: 0,
            error: `${error.name}: ${error.message}`,
          };
        }
        scores[outputFileName] = { score: 0, error: String(error) };
      }
    }

    const result = {
      score:
        Object.values(scores)
          .map((value) => value.score)
          .reduce((a, b) => a + b, 0) / Object.keys(scores).length,
      metadata: {
        ...scores,
      },
    };

    await eslintCache.set(eslintCacheKey, result);

    return result;
  },
});

export const LLMPromptInputOutputEvaluatorMultiFile = createScorer<
  EvalInput,
  EvalExpected
>({
  name: "LLM",
  description:
    "Checks if the output file system matches the goals set in the prompt using an LLM.",
  scorer: async ({ input, expected, output }) => {
    function printMemoryFileSystem(memoryFileSystem: MemoryFileSystem) {
      let printedOutputFileSystem = "";

      for (const [outputFileName, outputText] of Object.entries(
        memoryFileSystem
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
      console.log("generating llm score");
      const {
        object: { score, reasoning },
      } = await generateObject({
        model,
        ...inferenceOptionsAsyncLocalStorage.getStore(),
        system: `
          You are a careful and critical LLM agent reviewer, ensuring quality of output.

          You will receive a prompt, input and output files.
          Give a score 1-100 for how well the prompt is solved for in the output files based these factors:
          - How well the output matches the goal of the prompt.
          - Correctness of the output.
          - Syntax errors in the output.
          - Likelihood of the output to be executable (if it is code).
          - Unrelated files should not be changed.
          - Additional newlines at the end DO NOT LOWER THE SCORE.
          - If the actual output matches the expected output, give a score of 100.

          When there is any issue that leads the the goal not being achieved, lower the score dramatically (below 50 is fine).
          At the same time, when the goal is achieved fully without issues, give a score of 100.

          Also give your reasoning for the score, explaining why you think the score is what it is. This is important.

          call the json tool!
          args format:
          {
            "reasoning": "The reasoning for the score",
            "score": 20
          }
        `,
        prompt: `
          prompt: ${input.prompt}

          input files:
          ${printMemoryFileSystem(input.memoryFileSystem)}

          expected output files (compare against these, but they themselves don't count):
          ${printMemoryFileSystem(expected!.memoryFileSystem)}

          actual output files (this is what matters):
          ${printMemoryFileSystem(output.memoryFileSystem)}

          call the json tool!
          args format:
          {
            "reasoning": "The reasoning for the score",
            "score": 20
          }
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

export const scorers = [
  LLMPromptInputOutputEvaluatorMultiFile,
  LevenshteinMultiFile,
  PrettierMultiFile,
  ESLintMultiFile,
];
