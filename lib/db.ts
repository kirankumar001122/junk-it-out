import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
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
    log: ['error', 'warn'],
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

globalForPrisma.prisma = db;
