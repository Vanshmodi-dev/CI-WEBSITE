/**
 * Read back what is actually in PostgreSQL after a migration.
 *
 * Reads the live catalogue rather than trusting the migration file — the point
 * is to confirm the database agrees with what we think we wrote.
 *
 * Prints structure only. No row data, and nothing derived from DATABASE_URL
 * beyond the host and database name.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { env, exit } from 'node:process';

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

function heading(text) {
  console.log(`\n${text}\n${'-'.repeat(text.length)}`);
}

try {
  const [{ version }] = await prisma.$queryRaw`SELECT version()`;
  console.log('PostgreSQL:', version.split(',')[0]);

  const [{ current_database, inet_server_port }] =
    await prisma.$queryRaw`SELECT current_database(), inet_server_port()`;
  console.log(`Database  : ${current_database} on port ${inet_server_port}`);

  heading('TABLES');
  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  for (const t of tables) console.log(' ', t.table_name);
  console.log(`  => ${tables.length} tables`);

  heading('ENUMS');
  const enums = await prisma.$queryRaw`
    SELECT t.typname, count(e.enumlabel)::int AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    GROUP BY t.typname ORDER BY t.typname`;
  for (const e of enums) console.log(`  ${e.typname} (${e.labels} values)`);
  console.log(`  => ${enums.length} enums`);

  heading('CONSTRAINTS BY TYPE');
  const counts = await prisma.$queryRaw`
    SELECT contype::text AS contype, count(*)::int AS n FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' GROUP BY contype::text ORDER BY contype::text`;
  const label = { c: 'CHECK', f: 'FOREIGN KEY', p: 'PRIMARY KEY', u: 'UNIQUE' };
  for (const c of counts) {
    console.log(`  ${(label[c.contype] ?? c.contype).padEnd(12)} ${c.n}`);
  }

  heading('CHECK CONSTRAINTS (excluding NOT NULL)');
  const checks = await prisma.$queryRaw`
    SELECT rel.relname AS table_name, c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype = 'c'
    ORDER BY rel.relname, c.conname`;
  let current = '';
  for (const c of checks) {
    if (c.table_name !== current) {
      current = c.table_name;
      console.log(`  ${current}`);
    }
    console.log(`     - ${c.conname}`);
  }
  console.log(`  => ${checks.length} CHECK constraints`);

  heading('FOREIGN KEYS');
  const fks = await prisma.$queryRaw`
    SELECT c.conname, rel.relname AS from_table, f.relname AS to_table,
           CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                              WHEN 'a' THEN 'NO ACTION' ELSE c.confdeltype::text END AS on_delete
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_class f ON f.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype = 'f' ORDER BY c.conname`;
  for (const f of fks) {
    console.log(`  ${f.from_table} -> ${f.to_table}  ON DELETE ${f.on_delete}`);
  }
  console.log(`  => ${fks.length} foreign keys`);

  heading('INDEXES');
  const idx = await prisma.$queryRaw`
    SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname = 'public' ORDER BY tablename, indexname`;
  for (const i of idx) console.log(`  ${i.tablename.padEnd(18)} ${i.indexname}`);
  console.log(`  => ${idx.length} indexes (includes primary keys)`);

  heading('CONSENT COLUMN DEFAULTS AND NULLABILITY');
  const cols = await prisma.$queryRaw`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name LIKE 'consent%' OR column_name = 'published'
           OR column_name = 'displayNameMode')
    ORDER BY table_name, column_name`;
  for (const c of cols) {
    console.log(
      `  ${c.table_name.padEnd(16)} ${c.column_name.padEnd(16)} ${c.data_type.padEnd(10)} ` +
        `nullable=${c.is_nullable.padEnd(3)} default=${c.column_default ?? '-'}`,
    );
  }
} catch (error) {
  console.error('Inspection failed:', error instanceof Error ? error.message : error);
  exit(1);
} finally {
  await prisma.$disconnect();
}
