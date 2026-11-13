/** Loads the repository-root `.env.local` file for backend scripts and local development. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export function loadLocalEnv() {
  if (process.env.NODE_ENV === "production") return;

  let directory = process.cwd();
  const filesystemRoot = parse(directory).root;

  while (true) {
    const envPath = join(directory, ".env.local");
    if (existsSync(envPath)) {
      for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const separator = line.indexOf("=");
        if (separator === -1) continue;

        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        if (key && value && !Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
      }
      return;
    }

    if (directory === filesystemRoot) return;
    directory = dirname(directory);
  }
}
