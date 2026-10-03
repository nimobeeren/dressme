import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { logger, SERVICE_NAME } from "./logger";
import { getSettings } from "./settings";

/**
 * Exports log records to PostHog over OTLP. Called once from `instrumentation.ts`
 * when the Node.js server starts; does nothing when `POSTHOG_API_KEY` is unset.
 */
export function configureLogging(): void {
  const { POSTHOG_API_KEY, POSTHOG_API_HOST } = getSettings();
  if (!POSTHOG_API_KEY) return;

  // Surface failed exports (wrong API key, unreachable host) on the console.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const exporter = new OTLPLogExporter({
    url: `${POSTHOG_API_HOST.replace(/\/+$/, "")}/i/v1/logs`,
    headers: { Authorization: `Bearer ${POSTHOG_API_KEY}` },
  });

  // Resource attributes are attached to every record. `deployment.environment`
  // separates local dev, Vercel previews and production in the PostHog Logs page.
  const resourceAttributes: Record<string, string> = {
    "service.name": SERVICE_NAME,
    "deployment.environment": process.env.VERCEL_ENV ?? "local",
  };
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (commit) resourceAttributes["service.version"] = commit;

  // SimpleLogRecordProcessor sends each record as it is emitted, so nothing is
  // lost when a serverless function is frozen or the process stops.
  logs.setGlobalLoggerProvider(
    new LoggerProvider({
      resource: resourceFromAttributes(resourceAttributes),
      processors: [new SimpleLogRecordProcessor({ exporter })],
    }),
  );

  logger.info("Log export to PostHog enabled");
}
