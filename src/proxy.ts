import { getAuth0 } from "@/server/auth";

/**
 * Mounts the Auth0 SDK's authentication routes (`/auth/login`, `/auth/callback`,
 * `/auth/logout`, ...) and refreshes the session cookie on every request.
 */
export async function proxy(request: Request) {
  return await getAuth0().middleware(request);
}

export const config = {
  // Match any route that is NOT cacheable.
  // We don't apply the middleware to cacheable routes because it's not possible
  // to refresh a cookie when a response is read from cache.
  // This is fine because the cookie expiry is typically pretty long and the
  // user will probably make other (non-cacheable) requests in the meantime.
  matcher: [
    `/((?!api/images/outfit|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)`,
  ],
};
