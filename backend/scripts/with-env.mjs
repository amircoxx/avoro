import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

function loadEnvLocal() {
  const env = {};
  if (process.env.NODE_ENV === "production" || !existsSync(".env.local")) return env;
  const content = readFileSync(".env.local", "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2), "--schema", "backend/prisma/schema.prisma"], {
  stdio: "inherit",
  env: {
    ...loadEnvLocal(),
    ...process.env
  }
});

if (result.error) console.error("Failed to start Prisma:", result.error.message);
process.exit(result.status ?? 1);
