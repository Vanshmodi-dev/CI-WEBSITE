/**
 * Apply the data-retention policy.
 *
 * Clears `Enquiry.ipHash` past its window, removes expired audit entries, and
 * reports how many enquiries are older than the period suggested to the
 * institute. The policy itself, and the reasoning behind every number in it,
 * lives in src/lib/retention.ts.
 *
 * Run by hand today. Once hosting exists this becomes a scheduled job; it is
 * deliberately not wired into a request path, because retention that runs as a
 * side effect of page traffic stops when traffic does.
 *
 *   node scripts/retention.mjs           apply the policy
 *   node scripts/retention.mjs --dry-run report what would change
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { RETENTION, cutoff } from '../src/lib/retention-policy.ts';
import { env, argv, exit } from 'node:process';

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  exit(1);
}

const dryRun = argv.includes('--dry-run');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const now = Date.now();
const ago = (days) => cutoff(days, now);

try {
  console.log(`\n=== DATA RETENTION ${dryRun ? '(dry run)' : ''} ===\n`);

  const ipCutoff = ago(RETENTION.ipHashDays);
  const ipCandidates = await prisma.enquiry.count({
    where: { createdAt: { lt: ipCutoff }, ipHash: { not: null } },
  });
  console.log(`  ipHash older than ${RETENTION.ipHashDays} days : ${ipCandidates}`);

  const auditCutoff = ago(RETENTION.auditDays);
  const auditCandidates = await prisma.auditLog.count({ where: { at: { lt: auditCutoff } } });
  console.log(`  audit entries older than ${RETENTION.auditDays} days : ${auditCandidates}`);

  const staleCutoff = ago(RETENTION.suggestedEnquiryDays);
  const stale = await prisma.enquiry.count({ where: { createdAt: { lt: staleCutoff } } });
  console.log(`  enquiries older than ${RETENTION.suggestedEnquiryDays} days : ${stale}  (reported only — never deleted here)`);

  if (dryRun) {
    console.log('\n  Dry run: nothing was changed.\n');
  } else {
    const cleared = await prisma.enquiry.updateMany({
      where: { createdAt: { lt: ipCutoff }, ipHash: { not: null } },
      data: { ipHash: null },
    });
    const removed = await prisma.auditLog.deleteMany({ where: { at: { lt: auditCutoff } } });
    console.log(`\n  cleared ${cleared.count} ipHash value(s)`);
    console.log(`  removed ${removed.count} audit entry/entries`);
    console.log('\n  Enquiry rows were NOT deleted. That period is the institute\'s');
    console.log('  decision to make, not ours — see src/lib/retention.ts.\n');
  }
} finally {
  await prisma.$disconnect();
}
