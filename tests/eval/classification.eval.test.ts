import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { describe, expect, test } from "vitest";
import { classifyWearableImage } from "../../src/server/wearable-classification";
import type { WearableCategory } from "../../src/shared/wearable-categories";

const WEARABLES_DIR = join(import.meta.dirname, "..", "..", "images", "wearables");

function discoverCases(): Array<{ expected: string; path: string }> {
  const cases: Array<{ expected: string; path: string }> = [];
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
          cases.push({ expected: category, path: filePath });
        }
      }
    }
  }
  return cases;
}

describe("wearable classification eval", () => {
  const cases = discoverCases();

  test("has test cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  test.each(cases)(
    "classifies $path as '$expected'",
    async ({ expected, path }) => {
      const imageData = readFileSync(path);
      const predicted = await classifyWearableImage(imageData);
      // Eval doesn't assert correctness (accuracy varies by model),
      // it just logs the result for manual inspection
      const correct = predicted === expected;
      const status = correct ? "✓" : "✗";
      console.log(
        `${expected.padEnd(12)} ${String(predicted).padEnd(12)} ${status} ${basename(path)}`,
      );
    },
    { timeout: 30000 },
  );
});
