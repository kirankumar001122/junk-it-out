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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [{ emit: 'event', level: 'warn' }],
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

if (!globalForPrisma.observabilityAttached) {
  db.$use((_params, next) =>
    withDatabaseErrorLogging(() => next(_params)),
  );
  db.$on('warn', () => {
    logStructured('warn', 'database.client.warning', { dependency: 'database' });
  });
  globalForPrisma.observabilityAttached = true;
}

globalForPrisma.prisma = db;
