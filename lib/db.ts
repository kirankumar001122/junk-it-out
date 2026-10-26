import { PrismaClient } from '@prisma/client';
import { logStructured, withDatabaseErrorLogging } from './observability/structuredLogger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  observabilityAttached?: boolean;
};

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
  url.searchParams.set('connection_limit', '1');
  return url.toString();
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: [{ emit: 'event', level: 'warn' }],
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
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
  db.$use((_params, next) =>
    withDatabaseErrorLogging(() => next(_params)),
  );
  globalForPrisma.observabilityAttached = true;
}

globalForPrisma.prisma = db;
