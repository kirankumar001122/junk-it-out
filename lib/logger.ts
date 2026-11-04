import pino from "pino";

export const logger = pino({
  level: "info",
  redact: {
    paths: ["password", "otp", "token", "req.headers.authorization"],
    censor: "[REDACTED]"
  }
});

export const logApi = (api: string, status: number, duration: number) => {
  logger.info({ api, status, responseTime: `${duration}ms` });
};

export const sendAlert = (message: string) => {
  logger.error({ alert: message });
  console.error(`🚨 ALERT TRIGGERED: ${message}`);
};