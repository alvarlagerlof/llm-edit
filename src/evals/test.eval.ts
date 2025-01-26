import { evalite } from "evalite";

import {
  createMemoryFileSystem,
  runEvalTask,
  type EvalInput,
  type EvalExpected,
  scorers,
} from "./test-helpers";

evalite<EvalInput, EvalExpected>("Update README.md", {
  data: async () => {
    return [
      {
        input: {
          prompt:
            "In README.md, change the title of the markdown file 'Todo app' -> 'Calculator app'. After the title, change the description to 'Calculates stuff.'",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "README.md": `# Todo app\n\nDescription TBD.`,
            },
            {
              addEslintConfig: false,
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
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ];
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>("Puzzle", {
  data: async () => {
    return [
      {
        input: {
          prompt:
            "You are on a quest to solve a puzzle. You have file SECRET.md and file SAVE_ANSWER_HERE.md available. GO!",
          memoryFileSystem: await createMemoryFileSystem(
            {
              "SECRET.md": `The secret number is: 74`,
              "SAVE_ANSWER_HERE.md": `The puzzle is solved by saving the secret number here: `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "SECRET.md": `The secret number is: 74`,
              "SAVE_ANSWER_HERE.md": `The puzzle is solved by saving the secret number here: 74`,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ];
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>("Rename function", {
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
                      console.log(add(1, 2));
                    `,
            },
            {
              addEslintConfig: false,
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
                      console.log(addTwoNumbers(1, 2));
                    `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ];
  },
  task: runEvalTask,
  scorers,
});

evalite<EvalInput, EvalExpected>("Update dependency to latest version", {
  data: async () => {
    return [
      {
        input: {
          prompt: `In package.json, update eslint-plugin-react-compiler to the latest version.
ou may need to find out what the latest version is.
Proceed without user input until the full task is completed.
Take one thing at a time and report back.`,
          memoryFileSystem: await createMemoryFileSystem(
            {
              "package.json": `
                {
                    "name": "todo-app",
                    "description": "TODO",
                    "dependencies": {
                        "eslint-plugin-react-compiler": "19.0.0-beta-e552027-20250112"
                    }
                }
              `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
        expected: {
          memoryFileSystem: await createMemoryFileSystem(
            {
              "package.json": `
                {
                    "name": "todo-app",
                    "description": "TODO",
                    "dependencies": {
                        "eslint-plugin-react-compiler": "19.0.0-beta-decd7b8-20250118"
                    }
                }
              `,
            },
            {
              addEslintConfig: false,
              formatFiles: true,
            }
          ),
        },
      },
    ];
  },
  task: runEvalTask,
  scorers,
});

/**
    Future ideas:

    Delete Unused Variables
    Prompt: “Find and remove all unused variables in utils.ts.”
    Focus: Ensuring the agent can parse code, detect unused variables, and cleanly remove them.

    Refactor a Class to a Functional Component (React)
    Prompt: “Convert MyComponent from a class component to a functional component in MyComponent.tsx.”
    Focus: Code transformations, especially for React code structures.

    Add Missing Return Types (TypeScript)
    Prompt: “Add explicit return types to all exported functions in api.ts.”
    Focus: Modifying function signatures and ensuring TypeScript code remains valid.

    Strip Console Logs
    Prompt: “Remove all console.log statements from the src folder.”
    Focus: Searching and removing lines across multiple files.

    Rename a Variable in Multiple Files
    Prompt: “Rename the variable mainColor to primaryColor in all .ts files under src.”
    Focus: Large-scale rename operations that might span multiple files.

    Add a New ESLint Rule
    Prompt: “Add the rule no-explicit-any to the ESLint config and fix all violations.”
    Focus: Updating a config file and applying code fixes.

    Inject a License Header
    Prompt: “Add a license header to the top of every .ts file in the project.”
    Focus: Inserting standardized text in multiple files.

    Update Dependency Versions
    Prompt: “Upgrade all dependencies in package.json to the latest minor version and run any necessary code updates.”
    Focus: Editing a JSON file, possibly making code fixes if there are breaking changes.

    Split a Monolithic File
    Prompt: “Split bigModule.ts into separate files for each function: doTaskA.ts, doTaskB.ts, utils.ts.”
    Focus: Breaking one file into multiple files, adjusting imports/exports.

    Swap Out a Library
    Prompt: “Replace all usages of axios with fetch in api.ts and remove axios from package.json.”
    Focus: Searching for specific function calls, rewriting them, and editing dependencies.

    Add JSDoc Comments
    Prompt: “Add JSDoc comments to every exported function in helpers.js, describing parameters and return values.”
    Focus: Generating or injecting comments above function signatures.

    Rearrange Object Properties
    Prompt: “In config.json, sort properties alphabetically.”
    Focus: Parsing JSON, reordering object keys, then saving the result.

    Introduce Error Handling
    Prompt: “Wrap the logic in fetchData inside a try/catch and log errors.”
    Focus: Adding error handling code in the correct location.

    Convert JavaScript to TypeScript
    Prompt: “Convert the file legacy.js to TypeScript (legacy.ts) and add type definitions.”
    Focus: Language conversion, ensuring the new file has appropriate TypeScript constructs.

    Migrate Functions to a Shared File
    Prompt: “Move all utility functions from index.ts into lib/utils.ts and update imports accordingly.”
    Focus: Relocation of code, updating import paths, possibly across multiple files.

    Enforce a Naming Convention
    Prompt: “Enforce snake_case for all environment variables in .env and rename the references in the code.”
    Focus: Editing a config/environment file and then updating references where those variables are used.

    Add a Default Export
    Prompt: “Change the named export for getData in dataFetcher.ts to a default export. Update all imports to match.”
    Focus: Export changes and associated import refactors.

    Rewrite Conditionals
    Prompt: “Rewrite nested if/else blocks in logic.ts into a switch-case statement.”
    Focus: Restructuring code logic without changing overall behavior.

    Batch Rename a Directory
    Prompt: “Rename the folder components to ui and update all import paths.”
    Focus: Large-scale file system operation plus updating references.

    Add a New Test File
    Prompt: “Create a new test file calculateSum.test.ts for calculateSum.ts and add basic unit tests.”
    Focus: Creating a file, writing test code, and ensuring project structure is consistent.
 */
