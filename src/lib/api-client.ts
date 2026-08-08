/** Hand-written API client replacing the generated hey-api SDK. The server
 * lives in the same codebase (Next.js route handlers), so responses are
 * validated against the shared zod schemas instead of generated types. */

import {
  classifyResponseSchema,
  outfitSchema,
  userSchema,
  wearableSchema,
  type ClassifyResponse,
  type Outfit,
  type User,
  type Wearable,
} from "@/shared/schemas";
import type { WearableCategory } from "@/shared/wearable-categories";
import { z } from "zod";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

// A function that is used to get the auth token
let tokenGetter: (() => Promise<string>) | null = null;

// The token getter needs to be set at runtime because it uses React hooks
export function setTokenGetter(getter: () => Promise<string>) {
  tokenGetter = getter;
}

/** Error thrown for non-2xx API responses. `message` carries the server's
 * `detail` field when present so it can be shown to the user. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: FormData | Record<string, unknown>;
  signal?: AbortSignal;
  auth?: boolean;
}

async function request({ method, path, query, body, signal, auth = true }: RequestOptions) {
  const headers = new Headers();
  if (auth) {
    if (!tokenGetter) {
      throw new Error("Token getter not initialized");
    }
    headers.set("Authorization", `Bearer ${await tokenGetter()}`);
  }

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const search = query ? `?${new URLSearchParams(query)}` : "";
  const response = await fetch(`${BASE_URL}${path}${search}`, {
    method,
    headers,
    body: payload,
    signal,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data: unknown = await response.json();
      const detail = z.object({ detail: z.string() }).safeParse(data);
      if (detail.success) {
        message = detail.data.detail;
      }
    } catch {
      // Not a JSON error body; keep the generic message.
    }
    throw new ApiError(response.status, message);
  }

  return response;
}

export async function getMe(): Promise<User> {
  const response = await request({ method: "GET", path: "/users/me" });
  return userSchema.parse(await response.json());
}

export async function updateAvatarImage(image: Blob): Promise<void> {
  const body = new FormData();
  body.append("image", image);
  await request({ method: "PUT", path: "/images/avatars/me", body });
}

export async function getWearables(): Promise<Wearable[]> {
  const response = await request({ method: "GET", path: "/wearables" });
  return z.array(wearableSchema).parse(await response.json());
}

export async function createWearables(
  wearables: Array<{ category: WearableCategory; image: Blob | File }>,
): Promise<Wearable[]> {
  const body = new FormData();
  for (const wearable of wearables) {
    body.append("category", wearable.category);
    body.append("image", wearable.image);
  }
  const response = await request({ method: "POST", path: "/wearables", body });
  return z.array(wearableSchema).parse(await response.json());
}

export async function classifyWearable(
  image: File,
  options?: { signal?: AbortSignal },
): Promise<ClassifyResponse> {
  const body = new FormData();
  body.append("image", image);
  const response = await request({
    method: "POST",
    path: "/wearables/classify",
    body,
    signal: options?.signal,
  });
  return classifyResponseSchema.parse(await response.json());
}

export async function getOutfits(): Promise<Outfit[]> {
  const response = await request({ method: "GET", path: "/outfits" });
  return z.array(outfitSchema).parse(await response.json());
}

export async function createOutfit(params: { top_id: string; bottom_id: string }): Promise<void> {
  await request({ method: "POST", path: "/outfits", body: params });
}

export async function deleteOutfit(id: string): Promise<void> {
  await request({ method: "DELETE", path: "/outfits", query: { id } });
}
