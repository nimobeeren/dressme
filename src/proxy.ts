import { getAuth0 } from "@/server/auth0";

/**
 * Mounts the Auth0 SDK's authentication routes (`/auth/login`, `/auth/callback`,
 * `/auth/logout`, ...) and keeps rolling sessions fresh on every request.
 */
export async function proxy(request: Request) {
  return await getAuth0().middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
