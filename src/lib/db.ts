import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Prisma client — SERVER ONLY.
 *
 * `import 'server-only'` makes it a BUILD ERROR to import this module from a
 * client component. That is the structural guarantee behind "the browser never
 * talks to the database": it cannot be violated by accident, because the
 * bundler refuses to produce the bundle.
 *
 * DATABASE_URL is not prefixed NEXT_PUBLIC_, so Next will never inline it into
 * client JavaScript (Master Plan §19).
 *
 * CONSTRUCTION IS LAZY. Building the site must not require a live database —
 * pages that never query still build, and a missing DATABASE_URL surfaces at
 * the point of use with a clear message rather than crashing the build.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and provide a PostgreSQL connection string.',
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Query logging is OFF in production. Prisma query logs include bound
    // parameters, which for this schema means names, phone numbers and message
    // bodies — exactly what must not reach a log aggregator (§19).
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/** Create on first use, then reuse — including across dev hot reloads. */
export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const client = createClient();
  // Cached in dev to avoid exhausting the pool on every module reload. In
  // production the module itself is cached, so this is belt and braces.
  globalForPrisma.prisma = client;
  return client;
}

/** True when a connection string is configured at all. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
