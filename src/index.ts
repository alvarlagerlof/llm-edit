import { generateObject, NoSuchToolError, streamText, tool } from "ai";
import { writeFile } from "fs/promises";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { z } from "zod";
import { replaceSnippetInText } from "./replace-snippet";
import { getBinaries, pathToFolder, resolveInScope, scan } from "./files";
import { getCurrentModel } from "./models";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { inferenceOptionsAsyncLocalStorage } from "./inferenceOptionsAsyncLocalStorage";

export async function aiEdit({
  folder,
  prompt,
}: {
  folder: string;
  prompt: string;
}) {
  const scopeFolder = resolve(folder);
  const { prettier, eslint, yarn } = getBinaries();
  const model = getCurrentModel();

  const separator =
    "\n\n\n\n-----------------------------------------------\n\n\n\n";
  console.log(separator);
  console.log("INFO", {
    params: {
      folder,
      prompt,
    },
    binaries: {
      prettier,
      eslint,
      yarn,
    },
    scopeFolder,
    modelId: model.modelId,
  });
  console.log(separator);

  const { textStream } = await streamText({
    model,
    ...inferenceOptionsAsyncLocalStorage.getStore(),
    tools: {
      repeat_user_prompt: tool({
        description: `
        A tool for repeating the user instruction.
        The user prompt will be repeated for clarity.`,
        parameters: z.object({}),
        execute: async ({}) => {
          return prompt;
        },
      }),
      find_file: tool({
        description: `
        A tool for finding files by path.
        Can be used to check if a file exists.
        This is like a search function in a file explorer.
      `,
        parameters: z.object({
          name: z.string(),
        }),
        execute: async ({ name }) => {
          return returnErrorsAsText(async () => {
            const results = await scan({ scopeFolder, relativePath: name });

            return results.join("\n");
          });
        },
      }),
      find_by_content: tool({
        description: `
        A tool for finding file paths by content.
      `,
        parameters: z.object({
          exact_code_snippets_query: z
            .array(z.string())
            .describe("Exact code snippets"),
        }),
        execute: async ({ exact_code_snippets_query }) => {
          return returnErrorsAsText(async () => {
            const filePaths = [];

            for (const query of exact_code_snippets_query) {
              const output = execSync(
                `find ${scopeFolder} -type f -name "*.ts" -o -name "*.ts" -o -name "*.json" | xargs egrep -il '${query}'`,
                {
                  shell: "/bin/zsh",
                }
              )
                .toString()
                .trim()
                .split("\n");

              for await (const line of output) {
                const scopedLine = line
                  .replaceAll(scopeFolder, "")
                  .substring(1);
                if (scopedLine !== "" && !scopedLine.includes("node_modules")) {
                  filePaths.push(scopedLine);
                }
              }
            }

            console.log({ filePaths });

            if (filePaths.length === 0) {
              return "No file paths found, try another query. Perhaps something shorter and more specific?";
            }

            return filePaths.join("\n");
          });
        },
      }),
      read_file: tool({
        description: `
        A tool for reading a file. Any file format works.
      `,
        parameters: z.object({ path: z.string() }),
        execute: async ({ path }) => {
          return returnErrorsAsText(async () => {
            if (path == "") {
              throw new Error("Please provide a non-empty path to read from.");
            }

            return await readFile(
              await resolveInScope({ scopeFolder, relativePath: path }),
              "utf-8"
            );
          });
        },
      }),
      edit_file: tool({
        description: `
        Edits a file based on an instruction
        The instruction should be specific and reference clear part of the file.
        Make sure that you know what the path is before you run this tool.
        Do not add example text like /path/to/ to the path. The path will be resolved in the scope of the current folder.
        Make sure to not run this tool before you know for sure what file to edit.
      `,
        parameters: z.object({
          path: z.string(),
          instruction: z.string(),
        }),
        execute: async ({ path, instruction }) => {
          return returnErrorsAsText(async () => {
            const fileContent = await readFile(
              await resolveInScope({ scopeFolder, relativePath: path }),
              "utf-8"
            );

            if (fileContent.length < 1000) {
              const { textStream: textStreamResult } = await streamText({
                model,
                ...inferenceOptionsAsyncLocalStorage.getStore(),
                system: `
                  You are a text editor.
                  You take an text file and an instruction.
                  You return the entire text file, but modified according to the instruction.
                  Return raw text, no extra comments. If the file is code, the output should only be code.
                `,
                prompt: `
                  file_path:
                  ${path}

                  file_content:
                  ${fileContent}

                  instruction:
                  ${instruction}
                `,
              });

              let textStreamResultText = "";
              console.log("\nbegin result\n");
              for await (const textPartResult of textStreamResult) {
                process.stdout.write(textPartResult);
                textStreamResultText += textPartResult;
              }
              textStreamResultText += "\n";
              console.log("\nend result\n");

              await writeFile(
                await resolveInScope({ scopeFolder, relativePath: path }),
                textStreamResultText
              );

              return `File ${path} has been edited.`;
            }

            const { textStream: textStreamNewInstruction } = await streamText({
              model,
              ...inferenceOptionsAsyncLocalStorage.getStore(),
              system: `
              You will receive an instruction for an edit of a file.
              Rewrite the instruction to only mention the parts of the file, not the edit request.
              and instead focus entirely on which parts of the file the instruction applies to.
              Focus on the "source"/"original" text, and not the "target"/"replacement" text.
              The output should refer to a part of a file, not a file itself.
              Don't be too specific, just mention the part of the file.

              Example:
              input:
              Find the functions foo() and bar() and rename them to baz() and qux()

              output:
              relevant focus areas:
              - foo()
              - bar()

              Only return the relevant focus area, and nothing else.
            `,
              prompt: `
              instruction: ${instruction}
            `,
            });

            let newInstruction = "a few lines above + \n";
            console.log("\nbegin new instruction\n");
            for await (const textPartNewInstruction of textStreamNewInstruction) {
              process.stdout.write(textPartNewInstruction);
              newInstruction += textPartNewInstruction;
            }
            newInstruction += " + a few lines below";
            console.log("\nend new instruction\n");

            const { textStream: textStreamRelevantSnippets } = await streamText(
              {
                model,
                ...inferenceOptionsAsyncLocalStorage.getStore(),
                system: `
              You receive an instruction and a text file.
              Return a subset of the text (unmodified) that is relevant to the instruction.
              Do not change the snippet in any way.
              Don't include anything else than the snippet.

              For example, you may repeat a single function from a file of multiple functions.

              You can do this using the file_content. You don't need to use other tools.
              Return raw unmodified text, NO COMMENTS OR EXTRA TEXT.

              example input 1:
              instruction:
              foo()

              file_content:
              export function baz() {
                console.log("baz");
              }

              export function foo() {
                console.log("foo");
              }

              export function bar() {
                console.log("bar");
              }

              example output 1:
              }

              export function foo() {
                console.log("foo");
              }

              export function bar() {

              example input 2:
              instruction:
              react-query

              file_content:
              "@redux-devtools/extension": "3.3.0",
              "@segment/analytics-next": "1.76.1",
              "@sentry/nextjs": "8.51.0",
              "@stripe/react-stripe-js": "3.1.1",
              "@stripe/stripe-js": "5.5.0",
              "@tanstack/react-query": "5.64.2",
              "@upstash/redis": "1.34.3",
              "@upstash/vector": "1.2.0",
              "@vercel/edge-config": "1.4.0",
              "@vercel/flags": "3.0.1",

              example output 2 (includes two surrounding lines for context):
              "@stripe/stripe-js": "5.5.0",
              "@tanstack/react-query": "5.64.2",
              "@upstash/redis": "1.34.3",

              Notice how both example outputs contain a little bit of lines above and below the relevant snippet for context. This is important.
              It is critical that the snippet exists in the file, and isn't shortened or changed in the middle.
              DO NOT SKIP OVER ANY LINES.
              DON'T PRODUCE ANY NEW TEXT. THE SNIPPET SHOULD JUST BE AN EXTRACTION FROM THE FILE CONTENT.
            `,
                prompt: `
              instruction: ${newInstruction}
              file_content: ${fileContent}
            `,
              }
            );

            let relevantSnippetText = "";
            console.log("\nbegin snippet\n");
            for await (const textPartRelevantSnippet of textStreamRelevantSnippets) {
              process.stdout.write(textPartRelevantSnippet);
              relevantSnippetText += textPartRelevantSnippet;
            }
            console.log("\nend snippet\n");

            const { textStream: textStreamResult } = await streamText({
              model,
              ...inferenceOptionsAsyncLocalStorage.getStore(),
              system: `
              You are a text editor.
              You take an instruction and a text snippet,
              and you you return the entire text file, but modified according to the instruction.
              Return raw text, no extra comments.
              Be careful about making sure that the end of the text will work with the rest of the file. This means that persevering commas may be critical.
            `,
              prompt: `
              file_path: ${path}
              instruction: ${instruction}
              text_snippet: ${relevantSnippetText}
            `,
            });

            let textStreamResultText = "";
            console.log("\nbegin result\n");
            for await (const textPartResult of textStreamResult) {
              process.stdout.write(textPartResult);
              textStreamResultText += textPartResult;
            }
            console.log("\nend result\n");

            const newTextContent = replaceSnippetInText({
              text: fileContent,
              snippet: relevantSnippetText,
              replacement: textStreamResultText,
            });

            await writeFile(
              await resolveInScope({ scopeFolder, relativePath: path }),
              newTextContent
            );

            return `File ${path} has been edited.`;
          });
        },
      }),
      create_file: tool({
        description: `
        A tool for creating an empty file.
        Make sure to not run this tool before you know for sure what file to create.
      `,
        parameters: z.object({
          path: z.string(),
        }),
        execute: async ({ path }) => {
          return returnErrorsAsText(async () => {
            const resolvedPath = resolve(scopeFolder, path);

            // Error if the file already exists
            if (existsSync(resolvedPath)) {
              throw new Error(`File ${path} already exists.`);
            }

            const resolvedPathFolder = pathToFolder(resolvedPath) + "/";
            await mkdir(resolvedPathFolder, { recursive: true });

            await writeFile(resolvedPath, "");

            return `File ${path} has been created.`;
          });
        },
      }),
      get_latest_version_of_package: tool({
        description: `
        A tool for getting the latest version of a package.
      `,
        parameters: z.object({
          package_name: z.string(),
        }),
        execute: async ({ package_name }) => {
          return returnErrorsAsText(async () => {
            const output = execSync(`npm view ${package_name} version`, {
              shell: "/bin/zsh",
            })
              .toString()
              .trim();

            return output;
          });
        },
      }),
      lint: tool({
        description: `
        A tool for linting a file.
        It can check if there are any errors/warnings in the file.
      `,
        parameters: z.object({
          path: z.string(),
        }),
        execute: async ({ path }) => {
          return returnErrorsAsText(async () => {
            const resolvedPath = await resolveInScope({
              scopeFolder,
              relativePath: path,
            });

            const output = execSync(
              `${prettier} --check ${resolvedPath} && eslint ${resolvedPath}`,
              {
                shell: "/bin/zsh",
                cwd: pathToFolder(resolvedPath),
              }
            )
              .toString()
              .trim();

            return output;
          });
        },
      }),
      format: tool({
        description: `
        A tool for formatting a file.
        May be useful for fixing some linting errors.
        If another tool fails to run, try this one.
      `,
        parameters: z.object({
          path: z.string(),
        }),
        execute: async ({ path }) => {
          return returnErrorsAsText(async () => {
            const resolvedPath = await resolveInScope({
              scopeFolder,
              relativePath: path,
            });

            const output = execSync(
              `${prettier} --write ${resolvedPath} && eslint --fix ${resolvedPath}`,
              {
                shell: "/bin/zsh",
                cwd: pathToFolder(resolvedPath),
              }
            )
              .toString()
              .trim();

            return output;
          });
        },
      }),
      install: tool({
        description: `
        A tool for running npm/yarn install.
      `,
        parameters: z.object({}),
        execute: async () => {
          return returnErrorsAsText(async () => {
            const resolvedPath = await resolveInScope({
              scopeFolder,
              relativePath: ".",
            });

            const output = execSync(`${yarn} install --json`, {
              shell: "/bin/zsh",
              cwd: pathToFolder(resolvedPath),
            })
              .toString()
              .trim();

            return output;
          });
        },
      }),
    },
    experimental_repairToolCall: async ({
      toolCall,
      tools,
      parameterSchema,
      error,
      messages,
      system,
    }) => {
      console.log("\nexperimental_repairToolCall\n");

      if (NoSuchToolError.isInstance(error)) {
        return null; // do not attempt to fix invalid tool names
      }

      const tool = tools[toolCall.toolName as keyof typeof tools];

      const { object: repairedArgs } = await generateObject({
        model,
        ...inferenceOptionsAsyncLocalStorage.getStore(),
        schema: tool.parameters,
        prompt: [
          `The model tried to call the tool "${toolCall.toolName}"` +
            ` with the following arguments:`,
          JSON.stringify(toolCall.args),
          `The tool accepts the following schema:`,
          JSON.stringify(parameterSchema(toolCall)),
          "Please fix the arguments.",
          "Preserve the original argument values fully if possible.",
          "Disregard any generated absolute paths. Relative paths are fine.",
        ].join("\n"),
      });

      console.log("experimental_repairToolCall", { repairedArgs }, "\n");

      return { ...toolCall, args: JSON.stringify(repairedArgs) };
    },
    toolChoice: "auto",
    maxSteps: 8,
    system: `
    - You are an autonomous AI agent.
    - Don't ask for user input.
    - Never ask the user questions or for clarifications.
    - When the user mentions a path, they usually mean it to stay relative. The tools support relative paths.
    - If the users says "take a look at", then probably they mean "read".
    - Make sure to repeat any important information to the user such as a result of a tool.
    - The user wants to know what the result of a tool is.
    - Try to recover from errors.
    - Only use one tool per response. NEVER MORE THAN ONE TOOL. JUST ONE AT A TIME.
    `,
    // - After doing an edit, it's good to check that the file lints okay. If not, it has to be fixed.
    // - After editing a package.json file, you need to run the install tool.
    prompt,
    onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
      console.log("\n");

      for (const toolResult of toolResults) {
        console.log(
          "\nTOOL_RESULT",
          {
            name: toolResult.toolName,
            args: toolResult.args,
            result: toolResult.result,
          },
          "\n"
        );
      }

      console.log(separator);
    },
  });

  async function returnErrorsAsText(functionToRun: () => Promise<string>) {
    try {
      return await functionToRun();
    } catch (error) {
      if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
      }
      return String(error);
    }
  }

  for await (const textPart of textStream) {
    process.stdout.write(textPart);
  }
}
