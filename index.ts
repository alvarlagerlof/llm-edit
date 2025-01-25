import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, tool } from "ai";
import { writeFile } from "fs/promises";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { z } from "zod";
import { $ } from "bun";
import { replaceSnippetInText } from "./utils/replace-snippet";

import { parseArgs } from "util";

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

// const model = lmstudio("deepseek-r1-distill-qwen-7b");
const model = lmstudio("granite-3.1-8b-instruct");

function resolveInScope(relativePath: string) {
  const cleanedPath = relativePath.replaceAll(`'`, ``);

  if (cleanedPath.startsWith("/")) {
    return resolve(scopeFolder, cleanedPath.substring(1));
  }
  return resolve(scopeFolder, cleanedPath);
}

const { textStream } = await streamText({
  model,
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

    find_file_paths_by_content: tool({
      description: `
        A tool for finding file paths by content.
        The content is a substring.
        Use this tool when you don't know exactly what file path to edit or read.
        This tool is rarely needed.
      `,
      parameters: z.object({ content: z.string() }),
      execute: async ({ content }) => {
        console.log("\nfind_file_paths_by_content", { content });
        try {
          const filePaths = [];

          for await (const line of $`find ${scopeFolder} -type f -name "*.ts" -o -name "*.tsx" | xargs egrep -il '${content}'`.lines()) {
            const scopedLine = line.replaceAll(scopeFolder, "").substring(1);
            if (scopedLine !== "") {
              filePaths.push(scopedLine);
            }
          }

          console.log({ filePaths });

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
          return await readFile(resolveInScope(path), "utf-8");
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
          `,
      parameters: z.object({
        path: z.string(),
        instruction: z.string(),
      }),
      execute: async ({ path, instruction }) => {
        console.log("\nedit_file", { path, instruction });
        try {
          const fileContent = await readFile(resolveInScope(path), "utf-8");

          const { textStream: textStreamNewInstruction } = await streamText({
            model,
            system: `
              You will receive an instruction for an edit of a file.
              Rewrite the instruction to only mention the parts of the file, not the edit request.
              and instead focus entirely on which parts of the file the instruction applies to.
              Focus on the "source"/"original" code, and not the "target"/"replacement" code.

              Example:
              input:
              Find the functions foo() and bar() and rename them to baz() and qux()

              output:
              relevant focus areas:
              - foo()
              - bar()
            `,
            prompt: `
              instruction: ${instruction}
            `,
          });

          let newInstruction = "";
          console.log("\nbegin new instruction\n");
          for await (const textPartNewInstruction of textStreamNewInstruction) {
            process.stdout.write(textPartNewInstruction);
            newInstruction += textPartNewInstruction;
          }
          console.log("\nend new instruction\n");

          const { textStream: textStreamRelevantSnippets } = await streamText({
            model,
            system: `
              You receive an instruction and a text file containing code.
              Return a subset of the code (unmodified) that is relevant to the instruction.
              Do not change the snippet in any way.
              Don't include anything else than the snippet.

              For example, you may repeat a single function from a file of multiple functions.

              Return raw unmodified code, no extra comments.

              example input:
              instruction: foo()
              file_content: export function foo() {
                console.log("foo");
              }

              example output:
              export function foo() {
                console.log("foo");
              }
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
            model,
            system: `
              You are a text editor.
              You take an instruction and a code snippet,
              and you you return the entire text file, but modified according to the instruction.
              Return raw unmodified code, no extra comments.
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

          await writeFile(resolveInScope(path), newTextContent);

          return `File ${path} has been edited.`;
        } catch (error) {
          // @ts-expect-error TODO: fix this
          return error.toString();
        }
      },
    }),
  },
  toolChoice: "auto",
  maxSteps: 10,
  system:
    "Sometimes it's good to stop after a calling a tool so that you can read its output in the next iteration. You running in a programmed loop. Stop all the time, it's ok and good.",

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
