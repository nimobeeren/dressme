import { AddClient } from "@/views/add";
import { actionSpies } from "@/test/actions-mock";
import { renderWithProviders } from "@/test/utils";
import { mockRouter } from "@/test/mocks/next-navigation";
import { userEvent } from "vitest/browser";
import { expect } from "vitest";
import { test } from "@/test/test-extend";

async function renderAddPage() {
  return renderWithProviders(<AddClient />);
}

/** A tiny File object to stand in for an uploaded image. */
function makeImageFile(name = "shirt.png") {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: "image/png",
  });
}

/**
 * Waits for the AddClient to render and returns the hidden file input inside
 * the FileInputButton.
 */
async function waitForFileInput(
  screen: Awaited<ReturnType<typeof renderAddPage>>,
): Promise<HTMLInputElement> {
  await expect.element(screen.getByText(/let's add some clothes/i)).toBeVisible();
  const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!fileInput) {
    throw new Error("File input not found in AddClient");
  }
  return fileInput;
}

test("renders the page when user has an avatar", async () => {
  const screen = await renderAddPage();
  await expect.element(screen.getByText(/let's add some clothes/i)).toBeVisible();
});

test("submit button is disabled until a wearable is added", async () => {
  actionSpies.classifyWearable.mockResolvedValueOnce({ category: "t-shirt" });
  const screen = await renderAddPage();
  const doneButton = screen.getByRole("button", { name: /done/i });
  await expect.element(doneButton).toBeDisabled();

  // Upload a file via the hidden file input inside the "plus" button.
  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  await expect.element(doneButton).toBeEnabled();
});

test("classification auto-fills the category select", async () => {
  actionSpies.classifyWearable.mockResolvedValueOnce({ category: "pants" });
  const screen = await renderAddPage();

  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  expect(actionSpies.classifyWearable).toHaveBeenCalledTimes(1);

  // The Select's trigger is rendered as a <button role="combobox" aria-label="Category">.
  // It shows the selected value's label as text content.
  await expect
    .element(screen.getByRole("combobox", { name: /category/i }))
    .toHaveTextContent(/pants/i);
});

test("removing a card removes it from the form", async () => {
  actionSpies.classifyWearable.mockResolvedValueOnce({ category: "t-shirt" });
  const screen = await renderAddPage();

  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  // Card is present: the combobox (category select) shows.
  await expect.element(screen.getByRole("combobox", { name: /category/i })).toBeInTheDocument();

  // A user removes the card by clicking its "Remove" button.
  await userEvent.click(screen.getByRole("button", { name: /remove/i }));

  await expect.element(screen.getByRole("combobox", { name: /category/i })).not.toBeInTheDocument();
});

test("successful submit creates wearables and navigates home with a toast", async () => {
  actionSpies.classifyWearable.mockResolvedValueOnce({ category: "t-shirt" });
  const screen = await renderAddPage();

  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  // Wait for the classify suggestion to land in the select before submitting,
  // otherwise zod rejects a missing category.
  await expect
    .element(screen.getByRole("combobox", { name: /category/i }))
    .toHaveTextContent(/t-shirt/i);

  await userEvent.click(screen.getByRole("button", { name: /done/i }));

  // Submitting sends the form data to the server action, navigates home and
  // confirms the save with a toast.
  await expect.element(screen.getByText(/added item to your wardrobe/i)).toBeVisible();
  expect(actionSpies.createWearable).toHaveBeenCalledTimes(1);
  const formData = actionSpies.createWearable.mock.calls[0][0] as FormData;
  expect(formData.getAll("category")).toEqual(["t-shirt"]);
  expect(formData.getAll("image")).toHaveLength(1);
  expect(mockRouter.push).toHaveBeenCalledWith("/");
});

test("failed submit shows a destructive toast and stays on the page", async () => {
  actionSpies.classifyWearable.mockResolvedValueOnce({ category: "t-shirt" });
  actionSpies.createWearable.mockRejectedValueOnce(new Error("No avatar for you"));
  const screen = await renderAddPage();

  const fileInput = await waitForFileInput(screen);
  await userEvent.upload(fileInput, makeImageFile());

  await expect
    .element(screen.getByRole("combobox", { name: /category/i }))
    .toHaveTextContent(/t-shirt/i);

  await userEvent.click(screen.getByRole("button", { name: /done/i }));

  await expect.element(screen.getByText(/computer says/i)).toBeVisible();
  expect(mockRouter.push).not.toHaveBeenCalled();
});
