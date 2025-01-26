import { evalite } from "evalite";

import { aiEdit } from "..";
import {
  createMemoryFileSystem,
  createTemporaryFileSystem,
  ESLintMultiFile,
  LevenshteinMultiFile,
  PrettierMultiFile,
  type EvalInput,
  type EvalOutput,
  type MemoryFileSystem,
} from "./test-helpers";

evalite<EvalInput, EvalOutput>("Edit README.md", {
  data: async () => {
    return [
      {
        input: {
          prompt:
            "In README.md, change the title of the markdown file 'Todo app' -> 'Calculator app'. Then below the title, change the description to be 'Calculates stuff.'",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "README.md": `# Todo app\n\nDescription TBD.`,
            },
            {
              addEslintConfig: true,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "README.md": `# Calculator app\n\nCalculates stuff.`,
            },
            {
              addEslintConfig: true,
              formatFiles: true,
            }
          ),
        },
      },
    ];
  },
  task: async (input) => {
    const temporaryFileSystem = await createTemporaryFileSystem();
    temporaryFileSystem.hydrateMemoryFileSystem(input.memoryFileSystem);

    await aiEdit({
      folder: temporaryFileSystem.workingDirectory,
      prompt: input.prompt,
    });

    return {
      memoryFileSystem: await temporaryFileSystem.readToMemoryFileSystem(),
    };
  },
  scorers: [LevenshteinMultiFile, PrettierMultiFile, ESLintMultiFile],
});

evalite<EvalInput, EvalOutput>("Copy solution from file", {
  data: async () => {
    return [
      {
        input: {
          prompt:
            "Read PROBLEM.md. Then read SOLUTION.md." +
            "Keep in mind that when calling a tool, important information to be able to complete the task has to be provided. " +
            "Complete the full task on your own without user input. You may use further tools to complete the task.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "PROBLEM.md": `The secret number is: 74. Write your solution in SOLUTION.md.`,
              "SOLUTION.md": `Answer: `,
            },
            {
              addEslintConfig: true,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "PROBLEM.md": `The secret number is: 74. Write your solution in SOLUTION.md.`,
              "SOLUTION.md": `Answer: 74.`,
            },
            {
              addEslintConfig: true,
              formatFiles: true,
            }
          ),
        },
      },
    ];
  },
  task: async (input) => {
    const temporaryFileSystem = await createTemporaryFileSystem();
    temporaryFileSystem.hydrateMemoryFileSystem(input.memoryFileSystem);

    await aiEdit({
      folder: temporaryFileSystem.workingDirectory,
      prompt: input.prompt,
    });

    return {
      memoryFileSystem: await temporaryFileSystem.readToMemoryFileSystem(),
    };
  },
  scorers: [LevenshteinMultiFile, PrettierMultiFile, ESLintMultiFile],
});

evalite<EvalInput, EvalOutput>("Rename function", {
  data: async () => {
    return [
      {
        input: {
          prompt: "Rename the function 'add' to 'addTwoNumbers' in math.ts.",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "math.ts": `
                      function add(a: number, b: number) {
                        return a + b;
                      }
                    `,
            },
            {
              addEslintConfig: true,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "math.ts": `
                      function addTwoNumbers(a: number, b: number) {
                        return a + b;
                      }
                    `,
            },
            {
              addEslintConfig: true,
              formatFiles: true,
            }
          ),
        },
      },
    ];
  },
  task: async (input) => {
    const temporaryFileSystem = await createTemporaryFileSystem();
    temporaryFileSystem.hydrateMemoryFileSystem(input.memoryFileSystem);

    await aiEdit({
      folder: temporaryFileSystem.workingDirectory,
      prompt: input.prompt,
    });

    return {
      memoryFileSystem: await temporaryFileSystem.readToMemoryFileSystem(),
    };
  },
  scorers: [LevenshteinMultiFile, PrettierMultiFile, ESLintMultiFile],
});
