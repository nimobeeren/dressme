import { setTokenGetter } from "@/hooks/api";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";

interface AuthProviderProps {
  children: React.ReactNode;
}

function TokenInitializer() {
  const { getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    setTokenGetter(() => getAccessTokenSilently());
  }, [getAccessTokenSilently]);

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
