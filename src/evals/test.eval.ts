import { evalite } from "evalite";

import { aiEdit } from "..";
import {
  createMemoryFileSystem,
  createTemporaryFileSystem,
  LevenshteinMultiFile,
  type MemoryFileSystem,
} from "./test-helpers";

evalite<MemoryFileSystem, MemoryFileSystem>("Edit file", {
  data: async () => {
    return [
      {
        input: await createMemoryFileSystem(
          {
            "README.md": `# Todo app\n\nDescription TBD.`,
          },
          {
            addEslintConfig: true,
            formatFiles: true,
          }
        ),
        expected: await createMemoryFileSystem(
          {
            "README.md": `# Calculator app\n\nCalculates stuff.`,
          },
          {
            addEslintConfig: true,
            formatFiles: true,
          }
        ),
      },
    ];
  },
  task: async (input) => {
    const temporaryFileSystem = await createTemporaryFileSystem();
    temporaryFileSystem.hydrateMemoryFileSystem(input);

    await aiEdit({
      folder: temporaryFileSystem.workingDirectory,
      prompt:
        "In README.md, change the title of the markdown file 'Todo app' -> 'Calculator app'. Then below the title, change the description to be 'Calculates stuff.'",
    });

    return temporaryFileSystem.readToMemoryFileSystem();
  },
  scorers: [LevenshteinMultiFile],
});
