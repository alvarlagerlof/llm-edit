import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  experimental_wrapLanguageModel,
  generateObject,
  simulateReadableStream,
  streamObject,
  streamText,
  tool,
  type LanguageModelV1StreamPart,
} from "ai";
import { writeFile } from "fs/promises";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { z } from "zod";
import { $, Glob } from "bun";
import { replaceSnippetInText } from "./utils/replace-snippet";
import { parseArgs } from "util";
import { existsSync } from "fs";
import { createKvFileCache } from "./kv-file-cache";
import { pathToFolder } from "./path-to-folder";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    folder: {
      type: "string",
    },
    prompt: {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

console.log({
  folder: values.folder,
  prompt: values.prompt,
});

if (!values.folder || !values.prompt) {
  throw new Error("Please provide folder and prompt");
}

const scopeFolder = resolve(values.folder);

const lmstudio = createOpenAICompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
});

// const model = lmstudio("deepseek-r1-distill-qwen-7b"); // Calls the same tool many times
// const model = lmstudio("granite-3.1-8b-instruct"); // Pretty good
// const model = lmstudio("llama-3.2-3b-instruct"); // Fails to use tools
// const model = lmstudio("qwen2.5-coder-3b-instruct"); // Fails to use tools
// const model = lmstudio("gemma-2-2b-it"); // Fast, somewhat capable but not for complex tasks.
// const model = lmstudio("gemma-2-9b-it"); // Quite fast, but runs multiple tools at once.
// const model = lmstudio("yi-coder-9b-chat"); // Quiet good at tool use, but fails at snippet generation and edit.
// const model = lmstudio("hammer2.1-7b"); // Errors on startup, prompt jinja template error.
// const model = lmstudio("watt-tool-8b"); // Tool call format is not picked up.
const model = lmstudio("hermes-3-llama-3.1-8b"); // Fast, good at tools, and almost perfect at code.

const cache = createKvFileCache({
  name: "response-cache",
  context: model.modelId,
});

const wrappedLanguageModel = experimental_wrapLanguageModel({
  model,
  middleware: {
    wrapStream: async ({ doStream, params }) => {
      const cacheKey = JSON.stringify(params);

      // Check if the result is in the cache
      const cached = cache.get(cacheKey);

      // If cached, return a simulated ReadableStream that yields the cached result
      if (cached !== null && cached !== undefined) {
        // Format the timestamps in the cached response
        const formattedChunks = (cached as LanguageModelV1StreamPart[]).map(
          (p) => {
            if (p.type === "response-metadata" && p.timestamp) {
              return { ...p, timestamp: new Date(p.timestamp) };
            } else return p;
          }
        );
        return {
          stream: simulateReadableStream({
            initialDelayInMs: 0,
            chunkDelayInMs: 10,
            chunks: formattedChunks,
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      }

      // If not cached, proceed with streaming
      const { stream, ...rest } = await doStream();

      const fullResponse: LanguageModelV1StreamPart[] = [];

      const transformStream = new TransformStream<
        LanguageModelV1StreamPart,
        LanguageModelV1StreamPart
      >({
        transform(chunk, controller) {
          fullResponse.push(chunk);
          controller.enqueue(chunk);
        },
        flush() {
          // Store the full response in the cache after streaming is complete
          cache.set(cacheKey, JSON.stringify(fullResponse));
        },
      });

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      };
    },
  },
});

async function resolveInScope(relativePath: string) {
  const cleanedPath = relativePath.replaceAll(`'`, ``);

  let result = "";

  if (cleanedPath.startsWith("/")) {
    result = resolve(scopeFolder, cleanedPath.substring(1));
  }
  result = resolve(scopeFolder, cleanedPath);

  if (!existsSync(result)) {
    const glob = new Glob(`**/${relativePath}`);

    const results = [];
    for await (const file of glob.scan(scopeFolder)) {
      if (!file.includes("node_modules")) {
        results.push(file);
      }
    }

    if (results.length === 1) {
      result = resolve(scopeFolder, results[0]);
      return result;
    }

    if (results.length > 1) {
      throw new Error(`Multiple files found for ${relativePath}`);
    }

    throw new Error(`File ${result} does not exist`);
  }

  return result;
}

const prettierBin = "/Users/alvar/.nvm/versions/node/v22.12.0/bin/prettier";
const eslintBin = "/Users/alvar/.nvm/versions/node/v22.12.0/bin/eslint";
const yarnBin = "/Users/alvar/.nvm/versions/node/v22.12.0/bin/yarn";

const { textStream } = await streamText({
  model: wrappedLanguageModel,
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
        console.log("\nfind_file", { name });
        try {
          const glob = new Glob(`**/${name}`);

          const results = [];
          for await (const file of glob.scan(scopeFolder)) {
            if (!file.includes("node_modules")) {
              results.push(file);
            }
          }

          return results.join("\n");
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.toString();
        }
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
        console.log("\nfind_file_paths_by_content", {
          exact_code_snippets_query,
        });

        try {
          const filePaths = [];

          for (const query of exact_code_snippets_query) {
            for await (const line of $`find ${scopeFolder} -type f -name "*.ts" -o -name "*.ts" -o -name "*.json" | xargs egrep -il '${query}'`.lines()) {
              const scopedLine = line.replaceAll(scopeFolder, "").substring(1);
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
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.toString();
        }
      },
    }),
    read_file: tool({
      description: `
        A tool for reading a file. Any file format works.
      `,
      parameters: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        console.log("\nread_file", { path });
        try {
          return await readFile(await resolveInScope(path), "utf-8");
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.message;
        }
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
        console.log("\nedit_file", { path, instruction });
        try {
          const fileContent = await readFile(
            await resolveInScope(path),
            "utf-8"
          );

          const { textStream: textStreamNewInstruction } = await streamText({
            model: wrappedLanguageModel,
            system: `
              You will receive an instruction for an edit of a file.
              Rewrite the instruction to only mention the parts of the file, not the edit request.
              and instead focus entirely on which parts of the file the instruction applies to.
              Focus on the "source"/"original" code, and not the "target"/"replacement" code.
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

          const { textStream: textStreamRelevantSnippets } = await streamText({
            model: wrappedLanguageModel,
            system: `
              You receive an instruction and a text file containing code.
              Return a subset of the code (unmodified) that is relevant to the instruction.
              Do not change the snippet in any way.
              Don't include anything else than the snippet.

              For example, you may repeat a single function from a file of multiple functions.

              You can do this using the file_content. You don't need to use other tools.
              Return raw unmodified code, NO COMMENTS OR EXTRA TEXT.

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
            `,
            prompt: `
              instruction: ${newInstruction}
              file_content: ${fileContent}
            `,
          });

          let relevantSnippetText = "";
          console.log("\nbegin snippet\n");
          for await (const textPartRelevantSnippet of textStreamRelevantSnippets) {
            process.stdout.write(textPartRelevantSnippet);
            relevantSnippetText += textPartRelevantSnippet;
          }
          console.log("\nend snippet\n");

          const { textStream: textStreamResult } = await streamText({
            model: wrappedLanguageModel,
            system: `
              You are a text editor.
              You take an instruction and a code snippet,
              and you you return the entire text file, but modified according to the instruction.
              Return raw code, no extra comments.
              Be careful about making sure that the end of the code will work with the rest of the file. This means that persevering commas may be critical.
            `,
            prompt: `
              instruction: ${instruction}
              code_snippet: ${relevantSnippetText}
            `,
          });

          let textStreamResultText = "";
          console.log("\nbegin code\n");
          for await (const textPartResult of textStreamResult) {
            process.stdout.write(textPartResult);
            textStreamResultText += textPartResult;
          }
          console.log("\nend code\n");

          const newTextContent = replaceSnippetInText({
            text: fileContent,
            snippet: relevantSnippetText,
            replacement: textStreamResultText,
          });

          await writeFile(await resolveInScope(path), newTextContent);

          return `File ${path} has been edited.`;
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.toString();
        }
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
        console.log("\nget_latest_version_of_package", { package_name });
        try {
          const { stdout } = await $`npm view ${package_name} version`;
          return stdout.toString("utf8");
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.toString();
        }
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
        console.log("\nlint", { path });
        try {
          const resolvedPath = await resolveInScope(path);

          const { stdout, stderr } =
            await $`${prettierBin} --check ${resolvedPath} `
              .cwd(pathToFolder(resolvedPath))
              .nothrow()
              .quiet();

          if (stderr) {
            return stderr.toString("utf8");
          }

          return stdout.toString("utf8");
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.toString();
        }
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
        console.log("\nformat", { path });
        try {
          const resolvedPath = await resolveInScope(path);

          console.log({ resolvedPath });

          const { stdout, stderr } =
            await $`${prettierBin} --write ${resolvedPath}`
              .cwd(pathToFolder(resolvedPath))
              .nothrow()
              .quiet();

          if (stderr) {
            return stderr.toString("utf8");
          }

          return stdout.toString("utf8");
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.toString();
        }
      },
    }),
    install: tool({
      description: `
        A tool for running npm/yarn install.
      `,
      parameters: z.object({}),
      execute: async () => {
        console.log("\ninstall");
        try {
          const resolvedPath = await resolveInScope(".");

          const output = await $`${yarnBin} install --json`
            .cwd(pathToFolder(resolvedPath))
            .nothrow()
            .text();

          return output;
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.toString();
        }
      },
    }),
  },
  toolChoice: "auto",
  maxSteps: 10,
  system: `
    - You are an autonomous AI agent.
    - Don't ask for user input.
    - Never ask the user questions or for clarifications.
    - After doing an edit, it's good to check that the file lints okay. If not, it has to be fixed.
    - After editing a package.json file, you need to run the install tool.
    - Only use tool names that actually exist.
    - Make sure to repeat any important information to the user such as a result of a tool.
    - Try to recover from errors.
    - Only use one tool per response. NEVER MORE THAN ONE TOOL. JUST ONE AT A TIME.
    `,
  prompt: values.prompt,
  onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
    console.log("\nonStepFinish", {
      //   text,
      toolCalls,
      toolResults,
      //   finishReason,
    });
  },
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
