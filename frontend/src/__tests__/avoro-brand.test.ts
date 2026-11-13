import { readFileSync, readdirSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = new URL("..", import.meta.url);

function shippedSourceFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);

    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : shippedSourceFiles(entryUrl);
    }

    return [".ts", ".tsx"].includes(extname(entry.name)) ? [entryUrl] : [];
  });
}

describe("avoro brand", () => {
  it("uses avoro across shipped product copy and metadata", () => {
    const legacyBrandLocations = shippedSourceFiles(sourceRoot)
      .filter((file) => /\b(?:MUSE|Muse)\b/.test(readFileSync(file, "utf8")))
      .map((file) => file.pathname.replace(sourceRoot.pathname, ""));
    const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    const favicon = readFileSync(new URL("../../public/favicon.svg", import.meta.url), "utf8");
    const shippedCopy = shippedSourceFiles(sourceRoot)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(legacyBrandLocations).toEqual([]);
    expect(index).toContain("<title>avoro</title>");
    expect(index).not.toMatch(/\b(?:MUSE|Muse)\b/);
    expect(favicon).toContain("<title>avoro</title>");
    expect(shippedCopy).not.toContain("muse.app");
  });
});
