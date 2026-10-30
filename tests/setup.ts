if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/junk_it_out_test';
}

if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'vitest-only-secret';
}

if (!process.env.RAZORPAY_KEY_ID) {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_vitest';
}

import { db } from '../lib/db';

// Provide default fallback in Vitest environment so unit tests without local Postgres don't stall on tokenVersion checks
if ((db.user as any)?.findUnique) {
  (db.user as any).findUnique = async (args: any) => ({
    id: args?.where?.id || 'mock-user-id',
    tokenVersion: 1,
  });
}

if ((db.agent as any)?.findUnique) {
  (db.agent as any).findUnique = async (args: any) => ({
    id: args?.where?.id || 'mock-agent-id',
    tokenVersion: 1,
  });
}
