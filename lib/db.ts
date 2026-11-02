import { PrismaClient, Prisma } from '@prisma/client';
import { logStructured, withDatabaseErrorLogging } from './observability/structuredLogger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  observabilityAttached?: boolean;
};

/**
 * Standard transaction safety bounds to prevent pool exhaustion and thread lock contention under load.
 */
export const DEFAULT_TRANSACTION_OPTIONS = {
  maxWait: 5000, // Maximum time (5s) to acquire a connection from the pool
  timeout: 10000, // Maximum time (10s) the transaction can run before aborting
} as const;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || process.env.NODE_ENV !== 'production') {
    return databaseUrl;
  }

  const url = new URL(databaseUrl);
  if (url.hostname.includes('pooler.supabase.com')) {
    url.port = '6543';
    url.searchParams.set('pgbouncer', 'true');
  }

  const connectionLimit = process.env.DB_CONNECTION_LIMIT?.trim() || '1';
  url.searchParams.set('connection_limit', connectionLimit);
  url.searchParams.set('pool_timeout', '10');
  url.searchParams.set('connect_timeout', '10');

  return url.toString();
}

function createPrismaClient() {
  const databaseUrl = getDatabaseUrl();
  const client = new PrismaClient({
    log: [{ emit: 'event', level: 'warn' }],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

  client.$on('warn', () => {
    logStructured('warn', 'database.client.warning', { dependency: 'database' });
  });

  return client;
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient();

if (!globalForPrisma.observabilityAttached) {
  db.$use((params, next) =>
    withDatabaseErrorLogging(() => next(params), {
      databaseModel: params.model,
      databaseAction: params.action,
    }),
  );
  globalForPrisma.observabilityAttached = true;
}

globalForPrisma.prisma = db;

/**
 * Safely runs a Prisma interactive transaction with explicit connection pool timeouts
 * and error classification, preventing hung connections during high concurrency spikes.
 */
export async function runSafeTransaction<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  return db.$transaction(action, {
    maxWait: options?.maxWait ?? DEFAULT_TRANSACTION_OPTIONS.maxWait,
    timeout: options?.timeout ?? DEFAULT_TRANSACTION_OPTIONS.timeout,
    ...(options?.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
  });
}
