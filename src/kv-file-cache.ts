import { resolve } from "path";
import { cwd } from "process";
import sqlite3 from "sqlite3";
import { mkdirSync } from "fs";
import { pathToFolder } from "./files";

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

  const db = new sqlite3.Database(dbFilePath);
  db.run(
    "CREATE TABLE IF NOT EXISTS cache (key VARCHAR PRIMARY KEY, value VARCHAR)"
  );

  function get(key: string) {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT value FROM cache WHERE key = $key",
        {
          $key: `${context}:${key}`,
        },
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            if (
              row &&
              typeof row === "object" &&
              "value" in row &&
              typeof row.value === "string"
            ) {
              resolve(JSON.parse(row.value));
            }
            resolve(null);
          }
        }
      );
    });
  }

  function set(key: string, value: any) {
    return new Promise<void>((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO cache (key, value) VALUES ($key, $value)",
        {
          $key: `${context}:${key}`,
          $value: JSON.stringify(value),
        },
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  return {
    get,
    set,
  };
}
