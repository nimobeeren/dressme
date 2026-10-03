import { logs, SeverityNumber, type LogAttributes } from "@opentelemetry/api-logs";

/** Name of the service that log records are attributed to. */
export const SERVICE_NAME = "dressme";

const otelLogger = logs.getLogger(SERVICE_NAME);

function emit(
  severityNumber: SeverityNumber,
  severityText: string,
  body: string,
  attributes?: LogAttributes,
): void {
  otelLogger.emit({ severityNumber, severityText, body, attributes });
}

/**
 * Emits log records from server code. Records are exported to PostHog when
 * `POSTHOG_API_KEY` is set and dropped otherwise; see `logging.ts`.
 */
export const logger = {
  debug: (body: string, attributes?: LogAttributes) =>
    emit(SeverityNumber.DEBUG, "DEBUG", body, attributes),
  info: (body: string, attributes?: LogAttributes) =>
    emit(SeverityNumber.INFO, "INFO", body, attributes),
  warn: (body: string, attributes?: LogAttributes) =>
    emit(SeverityNumber.WARN, "WARN", body, attributes),
  error: (body: string, attributes?: LogAttributes) =>
    emit(SeverityNumber.ERROR, "ERROR", body, attributes),
};
