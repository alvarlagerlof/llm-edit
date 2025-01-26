import { describe, expect, test } from "bun:test";
import { countNumberOfOccurrences } from "./count-number-of-occurrences";

describe("countNumberOfOccurrences", () => {
  test("basic", () => {
    expect(
      countNumberOfOccurrences({ source: "hello world", target: "x" })
    ).toMatchObject({
      count: 0,
    });
    expect(
      countNumberOfOccurrences({ source: "hello world", target: "world" })
    ).toMatchObject({
      count: 1,
      position: 6,
    });
    expect(
      countNumberOfOccurrences({ source: "hello world", target: "hello" })
    ).toMatchObject({
      count: 1,
      position: 0,
    });
    expect(
      countNumberOfOccurrences({ source: "hello world", target: "hello world" })
    ).toMatchObject({
      count: 1,
      position: 0,
    });
    expect(
      countNumberOfOccurrences({ source: "hello world", target: "o" })
    ).toMatchObject({
      count: 2,
    });
  });
});
