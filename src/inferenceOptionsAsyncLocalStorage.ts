import { AsyncLocalStorage } from "async_hooks";

export const inferenceOptionsAsyncLocalStorage = new AsyncLocalStorage<{
  seed?: number;
  topP?: number;
  topK?: number;
  temperature?: number;
}>();
