import "./mocks";
import { setSettings } from "@/server/settings";
import { testSettings } from "@/test/settings";

// Provide valid placeholder settings for all server tests.
setSettings(testSettings);
