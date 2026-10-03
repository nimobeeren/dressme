/** Runs once when a Next.js server instance starts, before it serves requests. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { configureLogging } = await import("./server/logging");
    configureLogging();
  }
}
