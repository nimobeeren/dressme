import { setTokenGetter } from "@/hooks/api";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";

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
  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_API_AUDIENCE,
      }}
    >
      <TokenInitializer />
      {children}
    </Auth0Provider>
  );
}
