import { setTokenGetter } from "@/hooks/api";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import pRetry from "p-retry";
import { useEffect } from "react";

interface AuthProviderProps {
  children: React.ReactNode;
}

function TokenInitializer() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0();

  // The "invalid_grant" error occurs when the refresh token is expired
  // The "missing_refresh_token" error occurs when the refresh token is not available
  // In both cases, the user has to log in again
  // Related: https://community.auth0.com/t/rotating-refresh-token-locking-users-out-after-expiry/46203
  const isRefreshTokenError = (error: any) =>
    error?.error === "invalid_grant" || error?.error === "missing_refresh_token";

  useEffect(() => {
    setTokenGetter(async () => {
      try {
        // HACK: it seems like there is a delay before Auth0 makes the access token available
        // through `getAccessTokenSilently`. To work around this, we retry a few times.
        // A side-effect is that it takes a bit longer before we redirect to the login page when
        // the user does not have a valid token.
        return await pRetry(
          async () => {
            const token = await getAccessTokenSilently();
            console.info("Got access token");
            return token;
          },
          {
            minTimeout: 100,
            maxRetryTime: 1000,
            shouldRetry: ({ error }) => isRefreshTokenError(error),
            onFailedAttempt: ({ attemptNumber }) => {
              console.info(`Failed to get access token (attempt ${attemptNumber})`);
            },
          },
        );
      } catch (error) {
        if (!isRefreshTokenError(error)) {
          throw new Error("Failed to get access token", { cause: error });
        }

        console.info("Redirecting to login because of:", (error as any)?.error);
        await loginWithRedirect();
        // The next line should never be reached since the user is redirected to a page outside
        // our application
        throw new Error("Redirecting to login", { cause: error });
      }
    });
  }, [getAccessTokenSilently, loginWithRedirect]);

  return null;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // const router = useRouter();

  return (
    <Auth0Provider
      domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN!}
      clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: process.env.NEXT_PUBLIC_AUTH0_API_AUDIENCE!,
      }}
      useRefreshTokens
      // TODO: is this needed?
      // Need to set a redirect callback so Auth0 redirects work with the Next.js router.
      // onRedirectCallback={(appState) =>
      //   router.replace(appState?.returnTo || window.location.pathname)
      // }
    >
      <TokenInitializer />
      {children}
    </Auth0Provider>
  );
}
