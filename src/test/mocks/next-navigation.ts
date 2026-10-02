import { useSyncExternalStore } from "react";
import { vi } from "vitest";

// A minimal, in-test router that mirrors how `next/navigation` lets components
// observe the current path. `push`/`replace` change the pathname and notify
// subscribers, so a test rendering of the app can swap pages the way the real
// Next.js router does — instead of asserting on mock method calls.

let currentPath = "/";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Set the pathname directly (e.g. to seed a test's starting route). */
export function setPathname(href: string) {
  currentPath = href;
  emit();
}

export function resetPathname() {
  currentPath = "/";
  emit();
}

export const mockRouter = {
  push: vi.fn((href: string) => {
    currentPath = href;
    emit();
  }),
  replace: vi.fn((href: string) => {
    currentPath = href;
    emit();
  }),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const redirect = vi.fn((href: string) => {
  currentPath = href;
  emit();
});

export function useRouter() {
  return mockRouter;
}

export function usePathname() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => currentPath,
    () => currentPath,
  );
}

export function useSearchParams() {
  return new URLSearchParams();
}
