import { afterEach, beforeAll, vi } from "vitest";
import { authSpies, getAuthState, resetAuthState } from "./auth-state";
import { ensureWorkerStarted, worker } from "./worker";

/**
 * Mock `@auth0/auth0-react` globally. Tests mutate auth state via
 * `setAuthState()` from `auth-state.ts`; the mock reads the current value
 * on every call.
 */
vi.mock("@auth0/auth0-react", () => ({
  Auth0Provider: ({ children }: { children: React.ReactNode }) => children,
  useAuth0: () => {
    const state = getAuthState();
    return {
      isAuthenticated: state.kind === "authenticated",
      isLoading: state.kind === "loading",
      user: state.kind === "authenticated" ? state.user : undefined,
      getAccessTokenSilently: authSpies.getAccessTokenSilently,
      loginWithRedirect: authSpies.loginWithRedirect,
      logout: authSpies.logout,
    };
  },
  withAuthenticationRequired: <P extends object>(Component: React.ComponentType<P>) => {
    return function WithAuth(props: P) {
      const state = getAuthState();
      if (state.kind !== "authenticated") {
        // Match Auth0's behavior: kick off a login redirect and render nothing.
        void authSpies.loginWithRedirect();
        return null;
      }
      return <Component {...props} />;
    };
  },
}));

// Importing `@/hooks/api` triggers its top-level `client.setConfig` with the
// real env vars. We then override that config to hit same-origin URLs (so MSW
// can intercept without caring about `VITE_API_BASE_URL`) and wire the token
// getter to our mocked Auth0 spy.
import { client } from "@/api";
import { setTokenGetter } from "@/hooks/api";

setTokenGetter(async () => authSpies.getAccessTokenSilently());
client.setConfig({
  baseUrl: "",
  auth: async () => authSpies.getAccessTokenSilently(),
});

// Start MSW once for the whole test run (idempotent across files).
beforeAll(async () => {
  await ensureWorkerStarted({
    onUnhandledRequest: (req, print) => {
      const url = new URL(req.url);
      if (
        url.pathname.startsWith("/@") ||
        url.pathname.startsWith("/node_modules/") ||
        url.pathname.startsWith("/src/") ||
        url.pathname.startsWith("/test-images/") ||
        url.pathname === "/mockServiceWorker.js" ||
        url.pathname.startsWith("/__vitest") ||
        url.pathname === "/"
      ) {
        return;
      }
      print.warning();
      throw new Error(`Unhandled ${req.method} ${url.pathname}${url.search} in test`);
    },
    quiet: true,
  });
});

afterEach(() => {
  worker.resetHandlers();
  resetAuthState();
});
