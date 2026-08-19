import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { getSettings } from "./settings";

let _client: Auth0Client | null = null;

export function getAuth0(): Auth0Client {
  if (!_client) {
    const settings = getSettings();
    _client = new Auth0Client({
      domain: settings.AUTH0_DOMAIN,
      clientId: settings.AUTH0_CLIENT_ID,
      clientSecret: settings.AUTH0_CLIENT_SECRET,
      secret: settings.AUTH0_SECRET,
    });
  }
  return _client;
}
