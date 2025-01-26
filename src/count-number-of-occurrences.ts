export function countNumberOfOccurrences({
  source: text,
  target,
}: {
  source: string;
  target: string;
}): { count: number; position?: number } {
  let count = 0;
  let firstPosition = text.indexOf(target);
  let position = firstPosition;

  while (position !== -1) {
    count++;
    position = text.indexOf(target, position + 1);
  }

  return {
    count,
    position: count === 1 ? firstPosition : undefined,
  };
}
