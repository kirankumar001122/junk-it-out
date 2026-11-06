import { describe, expect, it } from 'vitest';
import { isDatabaseConfigurationError } from '@/lib/db';

describe('database configuration error classification', () => {
  it('classifies Prisma datasource URL validation errors as configuration failures', () => {
    expect(
      isDatabaseConfigurationError(
        new Error('Error validating datasource `db`: the URL must start with the protocol `postgresql://` or `postgres://`.')
      )
    ).toBe(true);
  });

  it('does not classify ordinary database operation errors as configuration failures', () => {
    expect(isDatabaseConfigurationError(new Error('Unique constraint failed'))).toBe(false);
  });
});
