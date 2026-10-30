import pino from "pino";

export const logger = pino({
  level: "info",
  redact: {
    paths: ["*.password", "*.token", "req.headers.authorization", "password", "token", "phone", "email"],
    censor: "[REDACTED]"
  },
  transport: process.env.NODE_ENV !== "production" ? { target: "pino-pretty" } : undefined,
});