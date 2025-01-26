import { resolve } from "path";
import { cwd } from "process";
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { pathToFolder } from "./utils/files";

export function createKvFileCache({
  name,
  context,
}: {
  name: string;
  context: string;
}) {
  const dbFilePath = resolve(
    cwd(),
    "node_modules/.cache/kv-file-cache/",
    name + ".db"
  );
  const dbFileFolderPath = pathToFolder(dbFilePath) + "/";
  mkdirSync(dbFileFolderPath, { recursive: true });

  const db = new Database(dbFilePath);
  db.run(
    "CREATE TABLE IF NOT EXISTS cache (key VARCHAR PRIMARY KEY, value VARCHAR)"
  );

  function get(key: string) {
    const query = db.query("SELECT value FROM cache WHERE key = $key");
    const result = query.get({ $key: `${context}:${key}` });
    if (
      result &&
      typeof result === "object" &&
      "value" in result &&
      typeof result.value === "string"
    ) {
      return JSON.parse(result.value);
    }
    return null;
  }

  function set(key: string, value: string) {
    const query = db.query(
      "INSERT INTO cache (key, value) VALUES ($key, $value)"
    );
    query.run({ $key: `${context}:${key}`, $value: value });
  }

  return {
    get,
    set,
  };
}
