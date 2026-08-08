import { createRemoteJWKSet, jwtVerify } from "jose";
import { getSettings } from "./settings";

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!_jwks) {
    const settings = getSettings();
    // This gets the JWKS from a given URL and does processing so you can
    // use any of the keys available
    const url = new URL(`https://${settings.AUTH0_DOMAIN}/.well-known/jwks.json`);
    _jwks = createRemoteJWKSet(url);
  }
  return _jwks;
}

export interface JwtPayload {
  sub: string;
  [key: string]: unknown;
}

function isJwtPayload(payload: unknown): payload is JwtPayload {
  return typeof payload === "object" && payload !== null && "sub" in payload;
}

export async function verifyToken(token: string | undefined): Promise<JwtPayload> {
  if (!token) {
    throw new UnauthenticatedError();
  }

  const settings = getSettings();

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      audience: settings.AUTH0_API_AUDIENCE,
      issuer: settings.AUTH0_ISSUER,
      algorithms: settings.AUTH0_ALGORITHMS.split(",").map((a) => a.trim()),
    });

    if (!isJwtPayload(payload)) {
      throw new UnauthorizedError("Invalid token payload");
    }

    return payload;
  } catch (error) {
    if (error instanceof UnauthenticatedError) throw error;
    throw new UnauthorizedError(String(error));
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Requires authentication");
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
  }
}
