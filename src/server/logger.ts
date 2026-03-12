const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apiToken",
  "api_token",
];

function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitize(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface Logger {
  error(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  debug(event: string, data?: Record<string, unknown>): void;
}

export function createLogger(levelOverride?: LogLevel): Logger {
  const configuredLevel =
    levelOverride ?? (process.env.LOG_LEVEL as LogLevel) ?? "info";
  const threshold = LOG_LEVELS[configuredLevel] ?? LOG_LEVELS.info;

  function log(
    level: LogLevel,
    event: string,
    data?: Record<string, unknown>,
  ): void {
    if (LOG_LEVELS[level] > threshold) {
      return;
    }
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      event,
    };
    if (data) {
      Object.assign(entry, sanitize(data));
    }
    const output = JSON.stringify(entry);
    if (level === "error") {
      process.stderr.write(`${output}\n`);
    } else {
      process.stdout.write(`${output}\n`);
    }
  }

  return {
    error: (event, data) => log("error", event, data),
    warn: (event, data) => log("warn", event, data),
    info: (event, data) => log("info", event, data),
    debug: (event, data) => log("debug", event, data),
  };
}
