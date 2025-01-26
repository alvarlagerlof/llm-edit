import { parseArgs } from "util";
import { aiEdit } from ".";

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

if (!values.folder || !values.prompt) {
  throw new Error("Please provide folder and prompt");
}

await aiEdit({
  folder: values.folder,
  prompt: values.prompt,
});
