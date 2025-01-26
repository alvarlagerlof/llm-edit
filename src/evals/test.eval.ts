import { evalite } from "evalite";
import { writeFile, mkdtemp, readdir, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import type { FileSystem } from "./types";
import { LevenshteinMultiFile } from "./custom-scorers";
import { aiEdit } from "..";

evalite<FileSystem, FileSystem>("Edit file", {
  data: async () => {
    return [
      {
        input: {
          "README.md": `# Todo app`,
          "package.json": `{"name": "todo-app"}`,
        },
        expected: {
          "README.md": `# Todo app\n\nThis is a todo app website.`,
          "package.json": `{"name": "todo-app"}`,
        },
      },
    ];
  },
  task: async (input) => {
    // Create temporary directory
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "ai-edit-eva"));

    // Hydrate filesystem with input
    for (const [fileName, fileContent] of Object.entries(input)) {
      const filePath = join(temporaryDirectory, fileName);
      console.log({ filePath });
      writeFile(filePath, fileContent);
    }

    writeFile(join(temporaryDirectory, "test.json"), '{"foo": "test"}');

    // // Run AI edit
    // await aiEdit({
    //   folder: temporaryDirectory,
    //   prompt: "",
    // });

    // Construct output based on fileSystem
    const output: FileSystem = {};
    // Read files in temporary directory
    const files = await readdir(temporaryDirectory, {
      withFileTypes: true,
      recursive: true,
    });

    return "hej";

    for await (const file of files) {
      const filePath = file.name;
      const fileContent = await readFile(filePath, "utf-8");
      output[filePath] = fileContent;
    }

    return output;
  },
  scorers: [LevenshteinMultiFile],
});
