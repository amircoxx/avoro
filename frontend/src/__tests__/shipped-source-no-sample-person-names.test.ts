import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const shippedSourceDirectory = join(process.cwd(), "src");
const samplePersonNames = ["Mia Chen", "Jasmine Wade", "Destiny Lewis"];

describe("shipped frontend source", () => {
  it("contains no sample-person-name placeholders", async () => {
    const sourceFiles = await findShippedSourceFiles(shippedSourceDirectory);
    const shippedSource = await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")));

    for (const name of samplePersonNames) {
      expect(shippedSource.join("\n")).not.toContain(name);
    }
  });
});

async function findShippedSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : findShippedSourceFiles(path);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  }));

  return nestedFiles.flat();
}
