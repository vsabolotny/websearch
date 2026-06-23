import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Read and JSON-parse a file; return `fallback` if it is missing or unparseable. */
export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Pretty-write `data` as JSON, creating the parent directory if needed. */
export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}
