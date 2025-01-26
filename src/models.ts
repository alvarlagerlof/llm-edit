import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  experimental_wrapLanguageModel,
  type LanguageModelV1StreamPart,
  simulateReadableStream,
} from "ai";
import { createKvFileCache } from "./kv-file-cache";

export function getCurrentModel() {
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

          for (const chunk of formattedChunks) {
            logChunk(chunk);
          }

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
            logChunk(chunk);

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

  return wrappedLanguageModel;
}

function logChunk(chunk: LanguageModelV1StreamPart) {
  //   switch (chunk.type) {
  //     case "tool-call":
  //       console.log(
  //         "\nTOOL_CALL",
  //         {
  //           name: chunk.toolName,
  //           args: JSON.parse(chunk.args),
  //         },
  //         "\n"
  //       );
  //       break;
  //     case "text-delta":
  //       process.stdout.write(chunk.textDelta);
  //       break;
  //     case "tool-call-delta": {
  //       //   process.stdout.write(chunk.argsTextDelta);
  //       break;
  //     }
  //     case "finish": {
  //       console.log("\n", chunk.finishReason, "\n");
  //       break;
  //     }
  //     case "response-metadata": {
  //       break;
  //     }
  //     default:
  //       console.log("Unknown chunk type", chunk);
  //       break;
  //   }
}
