import { describe, expect, test } from "bun:test";
import { replaceSnippetInText } from "./replace-snippet";

describe("replaceSnippetInText", () => {
  test("simple", () => {
    const text = "Hi I am a frog in a nice world";
    const snippet = "frog";
    const replacement = "dog";

    expect(replaceSnippetInText({ text, snippet, replacement })).toBe(
      "Hi I am a dog in a nice world"
    );
  });

  test("simple longer", () => {
    const text = "Hi I am a frog in a nice world and today is my birthday";
    const snippet = "nice world";
    const replacement = "beautiful world";

    expect(replaceSnippetInText({ text, snippet, replacement })).toBe(
      "Hi I am a frog in a beautiful world and today is my birthday"
    );
  });

  test("simple mismatched", () => {
    const text = "Hi I am a frog in a nice world and today is my birthday";
    const snippet = "nice !!! world";
    const replacement = "beautiful world";

    expect(replaceSnippetInText({ text, snippet, replacement })).toBe(
      "Hi I am a frog in a beautiful world and today is my birthday"
    );
  });

  test("basic", () => {
    const text = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed euismod, nisl eget
    ultricies ultrices, nisi nisl tincidunt nisi, eu tincidunt magna purus id

    Qui tempor laboris fugiat incididunt ad minim fugiat.
    Minim sint sint ex duis aliqua excepteur amet aliquip adipisicing.
    Adipisicing in esse sunt dolor eu consequat nisi nisi exercitation non mollit.

    Non velit. Ullamco anim et aliqua culpa ad enim occaecat Lorem ipsum amet esse.
    Reprehenderit Lorem Lorem minim cillum aliquip cupidatat reprehenderit amet. Nulla eu
    ad consectetur nisi in. Sint exercitation sunt culpa id laboris id laboris id fugiat.
`;

    const snippet = `Qui temporADDED laboris fugiat incididunt ad minim fugiat.
    Minim sint sint ex duis aliqua excepteur amet aliquip adipisicing.
    Adipisicing in esse sunt dolor eu consequat nisi nisi exercitation ADDEDnon mollit.`;

    const replacement = `REPLACED`;

    expect(replaceSnippetInText({ text, snippet, replacement }))
      .toBe(`Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed euismod, nisl eget
    ultricies ultrices, nisi nisl tincidunt nisi, eu tincidunt magna purus id

    REPLACED

    Non velit. Ullamco anim et aliqua culpa ad enim occaecat Lorem ipsum amet esse.
    Reprehenderit Lorem Lorem minim cillum aliquip cupidatat reprehenderit amet. Nulla eu
    ad consectetur nisi in. Sint exercitation sunt culpa id laboris id laboris id fugiat.
`);
  });
});
