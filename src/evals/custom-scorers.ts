import { Levenshtein } from "autoevals";
import { createScorer } from "evalite";
import type { FileSystem } from "./types";

export const LevenshteinMultiFile = createScorer<FileSystem, FileSystem>({
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

    for (const [expectedFileName, expectedText] of Object.entries(expected)) {
      if (!output[expectedFileName]) {
        return {
          score: 0,
          metadata: {
            error: `Expected file ${expectedFileName} not found`,
          },
        };
      }
      const score = await Levenshtein({
        output: output[expectedFileName],
        expected: expectedText,
      });
      if (!score.score) {
        return {
          score: 0,
          metadata: {
            error: `Score for ${expectedFileName} is not defined`,
          },
        };
      }
      scores[expectedFileName] = score.score;
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
