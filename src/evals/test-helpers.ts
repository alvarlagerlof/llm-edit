import { Levenshtein } from "autoevals";
import { createScorer } from "evalite";
import { writeFile, mkdtemp, readdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { format } from "prettier";

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
        printWidth: 100,
        trailingComma: "all",
        singleQuote: true,
        semi: false,
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
  name: "Levenshtein (multi file)",
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

    const scores: Record<string, number> = {};

    for (const [outputFileName, outputText] of Object.entries(output)) {
      if (!expected[outputFileName]) {
        scores[outputFileName] = 0;
        continue;
      }
      const score = await Levenshtein({
        output: outputText,
        expected: expected[outputFileName],
      });
      if (!score.score) {
        return {
          score: 0,
          metadata: {
            error: `Score for ${outputFileName} is not defined`,
          },
        };
      }
      scores[outputFileName] = score.score;
    }

    return {
      score:
        Object.values(scores).reduce((a, b) => a + b, 0) /
        Object.keys(scores).length,
      metadata: {
        ...scores,
      },
    };
  },
});
