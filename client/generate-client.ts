import { readFile, writeFile } from "fs/promises";
import path from "path";

import { createClient } from "@hey-api/openapi-ts";
import config from "./openapi-ts.config";

// This script generates an API client just like `npx openapi-ts` would, but changing the types to
// set ThrowOnError to true by default. Note that this only changes the types; you also need to do
// `client.setConfig({ throwOnError: true })` to get it to actually throw at runtime.

await createClient(config);

const sdkPath = path.resolve(
  typeof config.output === "string" ? config.output : config.output.path,
  "sdk.gen.ts",
);

let sdkContent = await readFile(sdkPath, { encoding: "utf-8" });

sdkContent = sdkContent.replace(
  /ThrowOnError extends boolean = false/g,
  "ThrowOnError extends boolean = true",
);

await writeFile(sdkPath, sdkContent, { encoding: "utf-8" });
