import { vi } from "vitest";

/**
 * Mutable auth state consumed by the `@auth0/auth0-react` mock in `setup.ts`.
 *
 * Kept in its own module so that `vi.mock` (which gets hoisted) can reference
 * it without tripping over hoisting rules for in-file declarations.
 */

export type AuthState =
  | { kind: "authenticated"; token: string; user: { sub: string } }
  | { kind: "unauthenticated" }
  | { kind: "loading" };

const DEFAULT_STATE: AuthState = {
  kind: "authenticated",
  token: "test-access-token",
  user: { sub: "auth0|test-user" },
};

let state: AuthState = DEFAULT_STATE;

/** Test-visible spies so tests can assert calls like loginWithRedirect. */
export const authSpies = {
  loginWithRedirect: vi.fn(async () => {}),
  logout: vi.fn(),
  getAccessTokenSilently: vi.fn(async () => {
    if (state.kind !== "authenticated") {
      throw { error: "missing_refresh_token" };
    }
    return state.token;
  }),
};

export function setAuthState(next: AuthState) {
  state = next;
}

export function resetAuthState() {
  state = DEFAULT_STATE;
  authSpies.loginWithRedirect.mockClear();
  authSpies.logout.mockClear();
  authSpies.getAccessTokenSilently.mockClear();
}

export function getAuthState(): AuthState {
  return state;
}
