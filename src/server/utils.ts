/** True when a connection URL targets local infrastructure rather than a hosted service. */
export function isLocalUrl(url: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
}
