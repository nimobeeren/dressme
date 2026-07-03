import { describe, expect, test } from "vitest";
import healthFixture from "../../tests/contract-fixtures/healthz.json";
import outfitsFixture from "../../tests/contract-fixtures/outfits.json";
import userFixture from "../../tests/contract-fixtures/users_me.json";
import wearablesFixture from "../../tests/contract-fixtures/wearables.json";
import { healthSchema, outfitSchema, userSchema, wearableSchema } from "./schemas";

/**
 * The fixtures are real responses recorded from the FastAPI backend
 * (api/scripts/record_contract.py). Parsing them against the zod schemas
 * proves the schemas describe the wire format the frontend was built against.
 */
describe("contract fixtures parse against the shared schemas", () => {
  test("GET /healthz", () => {
    expect(healthSchema.parse(healthFixture)).toEqual(healthFixture);
  });

  test("GET /users/me", () => {
    expect(userSchema.parse(userFixture)).toEqual(userFixture);
  });

  test("GET /wearables", () => {
    expect(wearablesFixture.length).toBeGreaterThan(0);
    for (const wearable of wearablesFixture) {
      expect(wearableSchema.parse(wearable)).toEqual(wearable);
    }
  });

  test("GET /outfits", () => {
    expect(outfitsFixture.length).toBeGreaterThan(0);
    for (const outfit of outfitsFixture) {
      expect(outfitSchema.parse(outfit)).toEqual(outfit);
    }
  });
});
