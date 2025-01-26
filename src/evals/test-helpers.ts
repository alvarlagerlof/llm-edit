import { Levenshtein } from "autoevals";
import { createScorer } from "evalite";
import { writeFile, mkdtemp, readdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { check, format } from "prettier";
import { ESLint } from "eslint";

const prettierOptions = {
  printWidth: 100,
  trailingComma: "all",
  singleQuote: true,
  semi: false,
} as const;

export type MemoryFileSystem = Record<string, string>;

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

export const LevenshteinMultiFile = createScorer<
  MemoryFileSystem,
  MemoryFileSystem
>({
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

    for (const [outputFileName, outputText] of Object.entries(output)) {
      if (!expected[outputFileName]) {
        scores[outputFileName] = {
          score: 0,
          meta: `Expected file ${outputFileName} not found`,
        };
        continue;
      }
      const score = await Levenshtein({
        output: outputText,
        expected: expected[outputFileName],
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

export const PrettierMultiFile = createScorer<
  MemoryFileSystem,
  MemoryFileSystem
>({
  name: "Prettier",
  description:
    "A simple scorer checks if the output file system is correctly formatted according to Prettier.",
  scorer: async ({ output }) => {
    const scores: Record<string, { score: number; meta: string | null }> = {};

    for (const [outputFileName, outputText] of Object.entries(output)) {
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

export const ESLintMultiFile = createScorer<MemoryFileSystem, MemoryFileSystem>(
  {
    name: "ESLint",
    description:
      "A simple scorer checks if the output file system is correctly formatted according to ESLint.",
    scorer: async ({ output }) => {
      const scores: Record<string, { score: number; meta: any }> = {};

      for (const [outputFileName, outputText] of Object.entries(output)) {
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
  }
);
