import { AddPage } from "@/pages/add";
import { http, HttpResponse } from "msw";
import { userEvent } from "vitest/browser";
import { expect } from "vitest";
import { test } from "@/test/test";
import { buildUser, renderWithProviders } from "@/test/utils";
import { Route, Routes } from "react-router";

function renderAddPageWithRouting() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<div>HOME STUB</div>} />
      <Route path="/add" element={<AddPage />} />
    </Routes>,
    { initialEntries: ["/add"] },
  );
}

/** A tiny File object to stand in for an uploaded image. */
function makeImageFile(name = "shirt.png") {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: "image/png",
  });
}

/**
 * Waits for the AddPage to finish loading (past the full-page spinner) and
 * returns the hidden file input inside the FileInputButton.
 */
async function waitForFileInput(
  screen: Awaited<ReturnType<typeof renderAddPageWithRouting>>,
): Promise<HTMLInputElement> {
  await expect.element(screen.getByText(/let's add some clothes/i)).toBeVisible();
  const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!fileInput) {
    throw new Error("File input not found in AddPage");
  }
  return fileInput;
}

test("redirects to home when user has no avatar", async ({ worker }) => {
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: false })),
    ),
  );
  const screen = await renderAddPageWithRouting();
  await expect.element(screen.getByText(/home stub/i)).toBeVisible();
});

test("renders the page when user has an avatar", async ({ worker }) => {
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
    ),
  );
  const screen = await renderAddPageWithRouting();
  await expect.element(screen.getByText(/let's add some clothes/i)).toBeVisible();
});

test("submit button is disabled until a wearable is added", async ({ worker }) => {
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
    ),
    http.post("*/wearables/classify", () => HttpResponse.json({ category: "t-shirt" })),
  );
  const screen = await renderAddPageWithRouting();
  const doneButton = screen.getByRole("button", { name: /done/i });
  await expect.element(doneButton).toBeDisabled();

  // Upload a file via the hidden file input inside the "plus" button.
  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  await expect.element(doneButton).toBeEnabled();
});

test("classify endpoint auto-fills the category select", async ({ worker }) => {
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
    ),
    http.post("*/wearables/classify", () => HttpResponse.json({ category: "pants" })),
  );
  const screen = await renderAddPageWithRouting();

  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  // The Select's trigger is rendered as a <button role="combobox" aria-label="Category">.
  // It shows the selected value's label as text content.
  await expect
    .element(screen.getByRole("combobox", { name: /category/i }))
    .toHaveTextContent(/pants/i);
});

test("removing a card removes it from the form", async ({ worker }) => {
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
    ),
    http.post("*/wearables/classify", () => HttpResponse.json({ category: "t-shirt" })),
  );
  const screen = await renderAddPageWithRouting();

  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  // Card is present: the combobox (category select) shows.
  await expect.element(screen.getByRole("combobox", { name: /category/i })).toBeInTheDocument();

  // Trash button has no accessible name; find it by the fact that it's the
  // only other button in the card besides combobox/file input trigger.
  // The Trash2 Button is a <button> inside the card with an aria-hidden svg.
  // We'll find it via the lucide icon's class name.
  const trashButton = screen.container.querySelector(".group button") as HTMLButtonElement;
  await userEvent.click(trashButton);

  await expect.element(screen.getByRole("combobox", { name: /category/i })).not.toBeInTheDocument();
});

test("successful submit creates wearables and navigates home with a toast", async ({ worker }) => {
  let createCalls = 0;
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
    ),
    http.post("*/wearables/classify", () => HttpResponse.json({ category: "t-shirt" })),
    http.post("*/wearables", () => {
      createCalls++;
      return HttpResponse.json({});
    }),
  );
  const screen = await renderAddPageWithRouting();

  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  // Wait for the classify suggestion to land in the select before submitting,
  // otherwise zod rejects a missing category.
  await expect
    .element(screen.getByRole("combobox", { name: /category/i }))
    .toHaveTextContent(/t-shirt/i);

  await userEvent.click(screen.getByRole("button", { name: /done/i }));

  await expect.poll(() => createCalls).toBe(1);
  await expect.element(screen.getByText(/home stub/i)).toBeVisible();
  await expect.element(screen.getByText(/added item to your wardrobe/i)).toBeVisible();
});
