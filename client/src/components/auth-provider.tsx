import { setTokenGetter } from "@/hooks/api";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";

interface AuthProviderProps {
  children: React.ReactNode;
}

function TokenInitializer() {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0();

  useEffect(() => {
    setTokenGetter(async () => {
      try {
        return await getAccessTokenSilently();
      } catch (error) {
        if ((error as any)?.error === "invalid_grant") {
          // This error occurs when the refresh token is expired
          // In that case, the user has to log in again
          // Related: https://community.auth0.com/t/rotating-refresh-token-locking-users-out-after-expiry/46203
          await loginWithRedirect();
          // The next line should never be reached since the user is redirected to a page outside
          // our application. But just in case it is, it seems sensible to try to get the token
          // again.
          return await getAccessTokenSilently();
        } else {
          throw error;
        }
      }
    });
  }, [getAccessTokenSilently, loginWithRedirect]);

  return null;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate();

  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_API_AUDIENCE,
      }}
      useRefreshTokens
      cacheLocation="localstorage"
      // Need to set a redirect callback to make it work with React Router
      // See: https://github.com/auth0/auth0-react/blob/1644bb53f7ef1bc5b62a904a0908587b3f12dd54/EXAMPLES.md#1-protecting-a-route-in-a-react-router-dom-app
      onRedirectCallback={(appState) =>
        navigate(appState?.returnTo || window.location.pathname, { replace: true })
      }
    >
      <TokenInitializer />
      {children}
    </Auth0Provider>
  );
}
