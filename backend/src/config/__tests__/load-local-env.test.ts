import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../load-local-env";

const emptyKey = "CODEX_TEST_PROCESS_EMPTY";
const missingKey = "CODEX_TEST_PROCESS_MISSING";
const originalDirectory = process.cwd();
const originalNodeEnv = process.env.NODE_ENV;
const originalEmpty = process.env[emptyKey];
const originalMissing = process.env[missingKey];
let directory = "";

describe("loadLocalEnv process authority", () => {
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "find-my-tech-env-"));
    writeFileSync(join(directory, ".env.local"), `${emptyKey}=local-override\n${missingKey}=local-default\n`);
    process.chdir(directory);
    process.env.NODE_ENV = "test";
    process.env[emptyKey] = "";
    delete process.env[missingKey];
  });

  afterEach(() => {
    process.chdir(originalDirectory);
    restoreEnvironment("NODE_ENV", originalNodeEnv);
    restoreEnvironment(emptyKey, originalEmpty);
    restoreEnvironment(missingKey, originalMissing);
    rmSync(directory, { recursive: true, force: true });
  });

  it("keeps an explicitly present empty process value while loading a missing key", () => {
    loadLocalEnv();

    expect(Object.prototype.hasOwnProperty.call(process.env, emptyKey)).toBe(true);
    expect(process.env[emptyKey]).toBe("");
    expect(process.env[missingKey]).toBe("local-default");
  });
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
