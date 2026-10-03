import "dotenv/config";
import { setSettings } from "@/server/settings";
import { testSettings } from "@/test/settings";

const geminiKey = process.env.GEMINI_API_KEY;
if (!geminiKey) {
  throw new Error("GEMINI_API_KEY is required for evals. Set it in your .env file or environment.");
}

setSettings({ ...testSettings, GEMINI_API_KEY: geminiKey });
