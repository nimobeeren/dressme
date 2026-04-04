import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.join(__dirname, "../images");

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const response = await request.post("http://localhost:8000/test/reset");
  expect(response.ok()).toBeTruthy();
});

test("shows empty state with selfie upload prompt", async ({ page }) => {
  await page.goto("http://localhost:5173/");
  await expect(page.getByRole("button", { name: "Upload a selfie" })).toBeVisible();
  // Add button should be disabled (no avatar yet)
  await expect(page.getByRole("button", { name: "Add" })).toBeDisabled();
});

test("upload selfie and generate avatar", async ({ page }) => {
  await page.goto("http://localhost:5173/");

  // Upload a selfie via the hidden file input
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(imagesDir, "humans/selfie_1.jpg"));

  // Should show "Generating your avatar..." while the background task runs
  await expect(page.getByText("Generating your avatar")).toBeVisible();

  // Wait for avatar generation to complete (frontend polls for status)
  // The Add button becomes a link (not disabled) once the avatar is ready
  await expect(page.getByRole("link", { name: "Add" })).toBeVisible({
    timeout: 30_000,
  });
});

test("add a wearable", async ({ page }) => {
  await page.goto("http://localhost:5173/");

  // Navigate to add page
  await page.getByRole("link", { name: "Add" }).click();
  await expect(page.getByText("Let's add some clothes")).toBeVisible();

  // Upload a wearable image
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(
    path.join(imagesDir, "wearables/tops/t-shirt/graphic-tee-casual.webp"),
  );

  // Wait for auto-classification to set the category
  await expect(page.getByLabel("Category")).toHaveText("T-shirt", {
    timeout: 10_000,
  });

  // Submit the form
  await page.getByRole("button", { name: "Done" }).click();

  // Should redirect back to home and show the wearable in the Tops tab
  await page.waitForURL("http://localhost:5173/");
  await expect(page.getByRole("tab", { name: "Tops" })).toBeVisible();
});
