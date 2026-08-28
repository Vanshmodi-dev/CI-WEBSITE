import 'server-only';

import { getPrisma } from '@/lib/db';
import { MEDIA_CONSUMERS, type MediaUsage } from '@/lib/media/consumers';

/**
 * Counting the places a photograph is used.
 *
 * The LIST of places is in `consumers.ts`, which is pure and therefore
 * testable against the schema itself. This file is only the queries — see that
 * file for why the list exists and what it cost to not have one.
 */

const EMPTY: MediaUsage = { total: 0, parts: [] };

/**
 * Usage for many paths at once, for the library grid.
 *
 * One grouped query per consumer rather than one per row: a library of a few
 * hundred photographs is fine on a laptop and slow on the institute's
 * connection, which is the reason the original wrote it this way and the reason
 * this keeps doing so.
 */
export async function countMediaReferences(
  paths: readonly string[],
): Promise<Map<string, MediaUsage>> {
  const result = new Map<string, MediaUsage>();
  if (paths.length === 0) return result;

  const prisma = getPrisma();
  const perConsumer = await Promise.all(
    MEDIA_CONSUMERS.map(async (consumer) => {
      /*
        `groupBy` is typed per model, and the four models have different shapes,
        so this is the one place a cast is unavoidable. It is confined to the
        call itself: `column` and `model` are both union-typed above, so a typo
        is a compile error rather than a silently empty result.
      */
      const model = prisma[consumer.model] as unknown as {
        groupBy: (args: unknown) => Promise<Array<Record<string, unknown>>>;
      };
      const rows = await model.groupBy({
        by: [consumer.column],
        where: { [consumer.column]: { in: paths as string[] } },
        _count: { _all: true },
      });
      return { consumer, rows };
    }),
  );

  for (const { consumer, rows } of perConsumer) {
    for (const row of rows) {
      const path = row[consumer.column];
      if (typeof path !== 'string' || path === '') continue;
      const count = Number((row._count as { _all: number } | undefined)?._all ?? 0);
      if (count === 0) continue;
      const existing = result.get(path) ?? { total: 0, parts: [] };
      result.set(path, {
        total: existing.total + count,
        parts: [...existing.parts, { consumer, count }],
      });
    }
  }

  return result;
}

/** Usage for exactly one path — what the delete guard asks. */
export async function mediaUsageFor(path: string): Promise<MediaUsage> {
  return (await countMediaReferences([path])).get(path) ?? EMPTY;
}

