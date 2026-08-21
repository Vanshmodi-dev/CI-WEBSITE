import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved the connection URL out of schema.prisma and into this file.
 *
 * This is used by the Prisma CLI (migrate, studio) ONLY — it never ships to the
 * browser. Application code connects through the driver adapter in
 * src/lib/db.ts. DATABASE_URL is read from the environment and is never
 * committed (Master Plan §19).
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
