import { describe, expect, test } from "vitest";
import { nestedSnakeToCamelCase } from "./utils";

describe("utils", () => {
  describe("objectSnakeCaseToCamelCase", () => {
    test("empty object", () => {
      expect(nestedSnakeToCamelCase({})).toEqual({});
    });

    test("empty array", () => {
      expect(nestedSnakeToCamelCase([])).toEqual([]);
    });

    test("simple object", () => {
      expect(
        nestedSnakeToCamelCase({
          foo_bar: "baz",
          long_key_name: "oof",
          hello__world: "test",
        }),
      ).toEqual({ fooBar: "baz", longKeyName: "oof", hello_World: "test" });
    });

    test("nested objects and arrays", () => {
      expect(
        nestedSnakeToCamelCase({
          key_a: {
            key_b: 0,
          },
          key_c: [[[{ key_d: 0 }, { key_e: 0, key_f: 0 }]]],
        }),
      ).toMatchInlineSnapshot(`
        {
          "keyA": {
            "keyB": 0,
          },
          "keyC": [
            [
              [
                {
                  "keyD": 0,
                },
                {
                  "keyE": 0,
                  "keyF": 0,
                },
              ],
            ],
          ],
        }
      `);
    });
  });
});
