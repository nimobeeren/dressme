import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import { classifyWearableImage } from "../src/server/wearable-classification";

const WEARABLES_DIR = join(import.meta.dirname, "..", "images", "wearables");

const repeats = Number(process.env.EVAL_REPEATS ?? 0);
if (!Number.isInteger(repeats) || repeats < 0) {
  throw new Error(
    `EVAL_REPEATS must be a non-negative integer (got ${JSON.stringify(process.env.EVAL_REPEATS)})`,
  );
}

function discoverCases(): Array<{ expected: string; path: string; relPath: string }> {
  const cases: Array<{ expected: string; path: string; relPath: string }> = [];
  const groups = readdirSync(WEARABLES_DIR).filter((f) => !f.startsWith("."));
  for (const group of groups.sort()) {
    const groupPath = join(WEARABLES_DIR, group);
    if (!statSync(groupPath).isDirectory()) continue;
    const categories = readdirSync(groupPath).filter((f) => !f.startsWith("."));
    for (const category of categories.sort()) {
      const catPath = join(groupPath, category);
      if (!statSync(catPath).isDirectory()) continue;
      const files = readdirSync(catPath).filter((f) => !f.startsWith("."));
      for (const file of files.sort()) {
        const filePath = join(catPath, file);
        if (statSync(filePath).isFile()) {
          cases.push({
            expected: category,
            path: filePath,
            relPath: relative(WEARABLES_DIR, filePath),
          });
        }
      }
    }
  }
  return cases;
}

describe("wearable-classification", () => {
  const cases = discoverCases();

  test("has test cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  test.each(cases)(
    "classifies $relPath as $expected",
    { timeout: 30000, repeats, concurrent: true },
    async ({ expected, path, relPath }) => {
      const imageData = readFileSync(path);
      const predicted = await classifyWearableImage(imageData);
      const correct = predicted === expected;
      const status = correct ? "✓" : "✗";
      console.log(`${expected.padEnd(12)} ${String(predicted).padEnd(12)} ${status} ${relPath}`);
    },
  );
});
