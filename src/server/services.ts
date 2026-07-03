import { waitUntil as vercelWaitUntil } from "@vercel/functions";
import { R2Storage, type BlobStorage } from "./blob-storage";
import { verifyToken as jwtVerify, type JwtPayload } from "./auth";

export interface AvatarGenerator {
  generate(selfieImageData: Buffer): Promise<Buffer>;
}

export interface WoaGenerator {
  generateImage(params: {
    avatarImage: Buffer;
    wearableImage: Buffer;
    category: string;
  }): Promise<Buffer>;
  generateMask(params: { woaImage: Buffer; category: string }): Promise<Buffer>;
}

export interface WearableClassifier {
  classify(imageData: Buffer): Promise<string | null>;
}

export type WaitUntilFn = (promise: Promise<unknown>) => void;

interface ServiceOverrides {
  db?: any;
  blobStorage?: BlobStorage;
  avatarGenerator?: AvatarGenerator;
  woaGenerator?: WoaGenerator;
  wearableClassifier?: WearableClassifier;
  verifyToken?: (token: string | undefined) => Promise<JwtPayload>;
  waitUntil?: WaitUntilFn;
}

let _overrides: ServiceOverrides = {};

export function setServices(overrides: ServiceOverrides): void {
  _overrides = { ..._overrides, ...overrides };
}

export function resetServices(): void {
  _overrides = {};
}

let _blobStorage: BlobStorage | undefined;
export function getBlobStorage(): BlobStorage {
  if (_overrides.blobStorage) return _overrides.blobStorage;
  if (!_blobStorage) _blobStorage = new R2Storage();
  return _blobStorage;
}

export function getVerifyToken() {
  if (_overrides.verifyToken) return _overrides.verifyToken;
  return jwtVerify;
}

export function getWaitUntil(): WaitUntilFn {
  if (_overrides.waitUntil) return _overrides.waitUntil;
  return vercelWaitUntil;
}
