import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { rejectForeignOrigin } from '@/lib/request-guard';
import { safeDownloadName } from '@/lib/csv';
import { buildExport, buildTemplate, EXPORT_KINDS, type ExportKind } from '@/lib/export';
import { log, logUnexpected } from '@/lib/log';

/**
 * Template and export downloads.
 *
 * A ROUTE HANDLER, NOT A SERVER ACTION, because the response is a file rather
 * than a re-render. That means it gets none of the protection Next gives Server
 * Actions, so everything is done explicitly:
 *
 *   - `getCurrentAdmin()` re-verifies the session here. Phase 10's lesson: the
 *     proxy is a redirect for a signed-out browser, not the boundary.
 *   - `rejectForeignOrigin` blocks a third-party page from triggering a
 *     download using the teacher's own cookie. It permits a request with NO
 *     Origin header, because that is what a browser sends when the teacher
 *     clicks the link on their own admin page - applying the mutation rule here
 *     refused the legitimate click, which is how this was found.
 *   - The filename is built from a fixed allowlist and then sanitised anyway,
 *     because `Content-Disposition` is where a stray quote or newline becomes
 *     response splitting.
 *   - `no-store`, because this is one account's private data and no cache
 *     anywhere should hold it.
 *
 * GET is used deliberately: a download is a read, and a browser must be able to
 * navigate to it. Nothing here mutates.
 */

const ALLOWED = new Set<string>([...EXPORT_KINDS.map((k) => k.kind), 'template']);

export async function GET(request: NextRequest) {
  const refused = rejectForeignOrigin(request);
  if (refused) return refused;

  const admin = await getCurrentAdmin();
  if (!admin) {
    // 404 rather than 401: an unauthenticated caller learns nothing about what
    // exists here.
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const kind = request.nextUrl.searchParams.get('kind') ?? '';
  if (!ALLOWED.has(kind)) {
    return new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const result =
      kind === 'template' ? buildTemplate() : await buildExport(kind as ExportKind);

    log.info('export.generated', { kind, rows: result.rows, adminId: admin.id });

    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        // The name comes from a fixed set, and is sanitised regardless.
        'Content-Disposition': `attachment; filename="${safeDownloadName(result.filename)}"`,
        'Cache-Control': 'no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    logUnexpected('export.failed', error);
    return new NextResponse('That file could not be generated. Please try again.', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
