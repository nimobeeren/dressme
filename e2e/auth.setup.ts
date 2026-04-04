import { expect, test as setup } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, "../playwright/.auth/user.json");

setup("authenticate via Auth0", async ({ page }) => {
  const username = process.env.E2E_TEST_USERNAME;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!username || !password) {
    throw new Error("E2E_TEST_USERNAME and E2E_TEST_PASSWORD must be set in .env");
  }

  // Navigate to the app — Auth0 will redirect to the login page
  await page.goto("http://localhost:5173/");
  await page.waitForURL(/auth\.dressme\.fashion/);

  // Fill in Auth0 Universal Login form
  await page.getByRole("textbox", { name: "Email address" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Wait for redirect back to the app
  await page.waitForURL("http://localhost:5173/");

  // Verify the app loaded (health check gate passed)
  // LEFT HERE
  // TODO: this breaks because the api returns my actual user data, not an empty state
  // might not be worth going through with this before next.js migration
  await expect(page.getByRole("button", { name: "Upload a selfie" })).toBeVisible({
    timeout: 30_000,
  });

  // Save auth state
  await page.context().storageState({ path: authFile });
});
