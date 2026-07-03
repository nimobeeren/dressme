import { AddPage } from "@/views/add";
import { mockRouter } from "@/test/mocks/next-navigation";
import { buildUser, buildWearable, renderWithProviders } from "@/test/utils";
import { http, HttpResponse } from "msw";
import { userEvent } from "vitest/browser";
import { describe, expect, vi } from "vitest";
import { test } from "@/test/test";

async function renderAddPage() {
  return renderWithProviders(<AddPage />);
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
  screen: Awaited<ReturnType<typeof renderAddPage>>,
): Promise<HTMLInputElement> {
  await expect.element(screen.getByText(/let's add some clothes/i)).toBeVisible();
  const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!fileInput) {
    throw new Error("File input not found in AddPage");
  }
  return fileInput;
}

describe("/add", () => {
  test("redirects to home when user has no avatar", async ({ worker }) => {
    worker.use(
      http.get("*/me", () =>
        HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: false })),
      ),
    );
    await renderAddPage();
    await vi.waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/");
    });
  });

  test("renders the page when user has an avatar", async ({ worker }) => {
    worker.use(
      http.get("*/me", () =>
        HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
      ),
    );
    const screen = await renderAddPage();
    await expect.element(screen.getByText(/let's add some clothes/i)).toBeVisible();
  });

  test("submit button is disabled until a wearable is added", async ({ worker }) => {
    worker.use(
      http.get("*/me", () =>
        HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
      ),
      http.post("*/wearables/classify", () => HttpResponse.json({ category: "t-shirt" })),
    );
    const screen = await renderAddPage();
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
    const screen = await renderAddPage();

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
    const screen = await renderAddPage();

    const fileInput = await waitForFileInput(screen);
    await userEvent.upload(fileInput, makeImageFile());

    // Card is present: the combobox (category select) shows.
    await expect.element(screen.getByRole("combobox", { name: /category/i })).toBeInTheDocument();

    // A user removes the card by clicking its "Remove" button.
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));

    await expect
      .element(screen.getByRole("combobox", { name: /category/i }))
      .not.toBeInTheDocument();
  });

  test("successful submit creates wearables and navigates home with a toast", async ({
    worker,
  }) => {
    worker.use(
      http.get("*/me", () =>
        HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
      ),
      http.post("*/wearables/classify", () => HttpResponse.json({ category: "t-shirt" })),
      http.post("*/wearables", () =>
        HttpResponse.json([buildWearable({ category: "t-shirt" })], { status: 201 }),
      ),
    );
    const screen = await renderAddPage();

    const fileInput = await waitForFileInput(screen);
    await userEvent.upload(fileInput, makeImageFile());

    // Wait for the classify suggestion to land in the select before submitting,
    // otherwise zod rejects a missing category.
    await expect
      .element(screen.getByRole("combobox", { name: /category/i }))
      .toHaveTextContent(/t-shirt/i);

    await userEvent.click(screen.getByRole("button", { name: /done/i }));

    // Submitting takes the user home and confirms the save with a toast.
    await expect.element(screen.getByText(/added item to your wardrobe/i)).toBeVisible();
    expect(mockRouter.push).toHaveBeenCalledWith("/");
  });
});
