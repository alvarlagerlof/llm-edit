import console from "console";
import { countNumberOfOccurrences } from "./count-number-of-occurrences";

export function replaceSnippetInText({
  text,
  snippet,
  replacement,
}: {
  text: string;
  snippet: string;
  replacement: string;
}): string {
  const { getFlattenedNodes } = createBinaryTree(snippet, 8);

  const flattenedNodes = getFlattenedNodes();

  for (const node of flattenedNodes) {
    const { count, position } = countNumberOfOccurrences({
      source: text,
      target: node.text,
    });

    if (count === 1 && position) {
      node.hasUniqueMatch = true;
      node.textStart = position;
      node.textEnd = position + node.text.length;
    }
  }

  const matchingNodeStart = flattenedNodes
    .filter((node) => node.hasUniqueMatch)

    .sort((a, b) => {
      if (a.snippetStart === b.snippetStart) {
        return a.depth - b.depth;
      }
      return a.snippetStart - b.snippetStart;
    })
    .at(0);

  const matchingNodeEnd = flattenedNodes
    .filter((node) => node.hasUniqueMatch)
    .sort((a, b) => {
      if (a.snippetEnd === b.snippetEnd) {
        return a.depth - b.depth;
      }
      return b.snippetEnd - a.snippetEnd;
    })
    .at(0);

  if (!matchingNodeEnd || !matchingNodeStart) {
    throw new Error("Could not find matching nodes");
  }

  return (
    text.substring(
      0,
      matchingNodeStart.textStart + matchingNodeStart.snippetStart
    ) +
    replacement +
    text.substring(matchingNodeEnd.textEnd)
  );
}

function createBinaryTree(text: string, targetDepth: number) {
  function splitTextInHalf(text: string) {
    const length = text.length;
    if (length < 2) {
      throw new Error("Text is too short");
    }

    const half = Math.floor(length / 2);
    return [text.substring(0, half), text.substring(half)];
  }

  type BinaryTreeNode = {
    text: string;
    left: null | BinaryTreeNode;
    right: null | BinaryTreeNode;
    hasUniqueMatch: boolean;
    textStart: number;
    textEnd: number;
    snippetStart: number;
    snippetEnd: number;
    depth: number;
  };

  function createNode(
    text: string,
    targetDepth: number,
    snippetStart: number,
    depth: number = 0
  ) {
    const node: BinaryTreeNode = {
      text,
      left: null,
      right: null,
      hasUniqueMatch: false,
      textStart: 0,
      textEnd: 0,
      snippetStart,
      snippetEnd: snippetStart + text.length,
      depth,
    };
    if (depth < targetDepth) {
      try {
        const [leftText, rightText] = splitTextInHalf(text);
        node.left = createNode(leftText, targetDepth, snippetStart, depth + 1);
        node.right = createNode(
          rightText,
          targetDepth,
          snippetStart + leftText.length,
          depth + 1
        );
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "Text is too short") {
            console.info(`Stopped binary tree creation at depth ${depth}`);
            return node;
          }
        } else {
          throw error;
        }
      }
    }
    return node;
  }

  function calculateLikelyMaxDepth(text: string, targetDepth: number) {
    let length = text.length;
    for (let n = 0; n < targetDepth; n++) {
      const newLength = Math.floor(length / 2);
      if (newLength < 2) {
        return n;
      }
      length = newLength;
    }
    throw new Error("Could not calculate likely max depth");
  }

  const rootNode = createNode(
    text,
    calculateLikelyMaxDepth(text, targetDepth),
    0
  );

  function getFlattenedNodes() {
    const flattened: BinaryTreeNode[] = [];

    function flatten(node: BinaryTreeNode) {
      flattened.push(node);
      if (node.left) {
        flatten(node.left);
      }
      if (node.right) {
        flatten(node.right);
      }
    }

    flatten(rootNode);
    return flattened;
  }

  return { tree: rootNode, getFlattenedNodes };
}
