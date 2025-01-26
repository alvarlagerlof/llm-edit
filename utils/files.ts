import { Glob } from "bun";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

export function pathToFolder(path: string) {
  return path.substring(0, path.lastIndexOf("/"));
}

export async function resolveInScope({
  scopeFolder,
  relativePath,
}: {
  scopeFolder: string;
  relativePath: string;
}) {
  const cleanedPath = relativePath.replaceAll(`'`, ``);

  let result = "";

  if (cleanedPath.startsWith("/")) {
    result = resolve(scopeFolder, cleanedPath.substring(1));
  }
  result = resolve(scopeFolder, cleanedPath);

  if (!existsSync(result)) {
    const results = await scan({ scopeFolder, relativePath });

    if (results.length === 1) {
      result = resolve(scopeFolder, results[0]);
      return result;
    }

    if (results.length > 1) {
      throw new Error(`Multiple files found for ${relativePath}`);
    }

    throw new Error(`File ${result} does not exist`);
  }

  return result;
}

export async function scan({
  scopeFolder,
  relativePath,
}: {
  scopeFolder: string;
  relativePath: string;
}) {
  const glob = new Glob(`**/${relativePath}`);

  const results = [];
  for await (const file of glob.scan(scopeFolder)) {
    if (!file.includes("node_modules")) {
      results.push(file);
    }
  }

  return results;
}

export function getBinaries() {
  const [prettier, eslint, yarn] = execSync(
    "source ~/.zshrc && which prettier && which eslint && which yarn",
    {
      shell: "/bin/zsh",
    }
  )
    .toString()
    .split("\n");

  return {
    prettier,
    eslint,
    yarn,
  };
}
