import pino from "pino";
import { env } from "@/env/server";
import { env as clientEnv } from "@/env/client";

/** Name of the service that log records are attributed to. */
export const SERVICE_NAME = "dressme";

const { NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN } = clientEnv;
const { POSTHOG_API_HOST } = env;
const commit = process.env.VERCEL_GIT_COMMIT_SHA;

const transport: pino.TransportSingleOptions | undefined = NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  ? {
      target: "pino-opentelemetry-transport",
      options: {
        loggerName: SERVICE_NAME,
        serviceVersion: commit ?? "0.0.0",
        // Resource attributes are attached to every record. `deployment.environment`
        // separates local dev, Vercel previews and production in the PostHog Logs page.
        resourceAttributes: {
          "service.name": SERVICE_NAME,
          "deployment.environment": process.env.VERCEL_ENV ?? "local",
          ...(commit ? { "service.commit": commit } : {}),
        },
        logRecordProcessorOptions: {
          // Sends each record as it is emitted, so nothing is lost when a
          // serverless function is frozen or the process stops.
          recordProcessorType: "simple",
          exporterOptions: {
            protocol: "http",
            httpExporterOptions: {
              url: `${POSTHOG_API_HOST.replace(/\/+$/, "")}/i/v1/logs`,
              headers: { Authorization: `Bearer ${NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN}` },
            },
          },
        },
      },
      // The transport runs in a worker thread. Turn off its resource
      // auto-detection, which would report the worker's process and host
      // details instead of the ones set above.
      worker: { env: { ...process.env, OTEL_NODE_RESOURCE_DETECTORS: "none" } },
    }
  : undefined;

/**
 * Server logger. Records are exported to PostHog over OTLP when
 * `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is set (see `.env.example`) and written to
 * stdout otherwise.
 *
 * `logger` runs on the Node.js server only; browser code must not import it.
 */
export const logger = pino({ level: "info", transport });
