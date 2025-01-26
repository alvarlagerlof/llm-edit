import { Levenshtein } from "autoevals";
import { createScorer } from "evalite";
import type { MemoryFileSystem } from "./types";

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
