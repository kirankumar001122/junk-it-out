export class JwtConfigurationError extends Error {
  constructor() {
    super('JWT_SECRET must be configured with at least 32 bytes to enable authentication.');
    this.name = 'JwtConfigurationError';
  }
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new JwtConfigurationError();
  }
  return secret;
}
