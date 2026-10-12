export function getApiErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (!payload || typeof payload !== "object") return fallback;

  const response = payload as {
    message?: unknown;
    error?: { message?: unknown } | string;
  };
  const message =
    typeof response.error === "object" && response.error !== null
      ? response.error.message
      : typeof response.error === "string"
        ? response.error
        : response.message;

  return typeof message === "string" && message.trim() ? message : fallback;
}
