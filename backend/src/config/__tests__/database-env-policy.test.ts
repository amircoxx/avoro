import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const child = vi.hoisted(() => ({ spawnSync: vi.fn((): { status: number | null; error?: Error } => ({ status: 0 })) }));
vi.mock("node:child_process", () => child);
vi.mock("@prisma/client", () => ({ PrismaClient: vi.fn() }));

const originalDirectory = process.cwd();
let directory: string;
const localUrl = "postgresql://local:placeholder@localhost:5432/local_test";
const shellUrl = "postgresql://shell:placeholder@localhost:5432/shell_test";
const otherUrl = "postgresql://other:placeholder@localhost:5432/other_test";

async function runWrapper() {
  // The wrapper's subprocess is intercepted; no Prisma command or database access occurs.
  const script = "../../../scripts/with-env.mjs";
  await import(script);
  return vi.mocked(child.spawnSync).mock.calls[0] as unknown as [string, string[], { env: NodeJS.ProcessEnv }];
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  child.spawnSync.mockReturnValue({ status: 0 });
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  directory = mkdtempSync(join(tmpdir(), "database-env-policy-"));
  process.chdir(directory);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", undefined);
  writeFileSync(join(directory, ".env.local"), `DATABASE_URL="${localUrl}"\n`);
  writeFileSync(join(directory, ".env"), `DATABASE_URL=${otherUrl}\n`);
});

afterEach(() => {
  process.chdir(originalDirectory);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("database command environment precedence", () => {
  it("runs the installed Prisma CLI through Node and forwards arguments", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue([process.execPath, "with-env.mjs", "migrate", "status"]);
    const [executable, args] = await runWrapper();
    expect(executable).toBe(process.execPath);
    expect(args).toEqual([
      createRequire(import.meta.url).resolve("prisma/build/index.js"), "migrate", "status",
      "--schema", "backend/prisma/schema.prisma"
    ]);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it("reports process launch failures instead of silently exiting", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    child.spawnSync.mockReturnValue({ status: null, error: new Error("spawn failed") });
    await runWrapper();
    expect(log).toHaveBeenCalledWith("Failed to start Prisma:", "spawn failed");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("preserves a failing Prisma exit code", async () => {
    child.spawnSync.mockReturnValue({ status: 2 });
    await runWrapper();
    expect(process.exit).toHaveBeenCalledWith(2);
  });

  it.each([shellUrl, ""])("preserves explicitly supplied DATABASE_URL (%s)", async (value) => {
    vi.stubEnv("DATABASE_URL", value);
    const [, , options] = await runWrapper();
    expect(options.env.DATABASE_URL).toBe(value);
  });

  it("uses .env.local as a default", async () => {
    const [, , options] = await runWrapper();
    expect(options.env.DATABASE_URL).toBe(localUrl);
  });

  it("works without .env.local when a URL is supplied", async () => {
    rmSync(join(directory, ".env.local"));
    vi.stubEnv("DATABASE_URL", shellUrl);
    const [, , options] = await runWrapper();
    expect(options.env.DATABASE_URL).toBe(shellUrl);
  });

  it("does not load local files in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const [, , options] = await runWrapper();
    expect(options.env.DATABASE_URL).toBeUndefined();
  });
});

describe("Prisma CLI environment policy", () => {
  it("loads .env.local rather than .env", async () => {
    await import("../../../../prisma.config");
    expect(process.env.DATABASE_URL).toBe(localUrl);
  });

  it("preserves an explicit URL", async () => {
    vi.stubEnv("DATABASE_URL", shellUrl);
    await import("../../../../prisma.config");
    expect(process.env.DATABASE_URL).toBe(shellUrl);
  });

  it("requires an injected URL in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("../../../../prisma.config")).rejects.toThrow();
    expect(process.env.DATABASE_URL).toBeUndefined();
  });
});

describe("runtime database environment policy", () => {
  it("parses a quoted local URL using the runtime loader", async () => {
    await import("../database");
    expect(process.env.DATABASE_URL).toBe(localUrl);
  });

  it("does not replace an explicitly empty URL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await import("../database");
    expect(process.env.DATABASE_URL).toBe("");
  });
});
