/**
 * A standalone S3-compatible service, for verification only.
 *
 * =============================================================================
 * WHY THIS EXISTS
 * =============================================================================
 * The point of Phase 17 is that photographs go to real object storage. Proving
 * that needs the WHOLE application running against the remote adapter — admin
 * upload, re-encode, store, database row, revalidation, public serving,
 * replacement, consent withdrawal, deletion — not just the adapter in
 * isolation.
 *
 * No real credentials exist and none were invented, so the bucket is this: an
 * in-memory service that speaks enough S3 to be indistinguishable from one, and
 * that REFUSES anything not carrying a well-formed SigV4 Authorization header.
 * A permissive stub would have passed even if signing were broken.
 *
 * ⚠ NOT PRODUCTION CODE, AND NOT REACHABLE FROM IT. It listens on loopback, it
 * is started only by verification scripts, and the credentials below are
 * obviously synthetic.
 *
 *   node scripts/mock-s3.mjs --port 9401 --bucket ci-media-test
 */

import { createServer } from 'node:http';
import { argv } from 'node:process';

const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

export const MOCK_ACCESS_KEY = 'ZZTESTACCESSKEY';
export const MOCK_SECRET_KEY = 'ZZTESTSECRETKEY-not-a-real-credential';

export function startMockS3({ port = 0, bucket = 'ci-media-test' } = {}) {
  const objects = new Map();
  let mode = 'ok';

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const auth = req.headers.authorization ?? '';

    /*
      Strict on purpose. If the adapter ever stopped signing, or signed with
      the wrong shape, every one of these requests would 403 here rather than
      quietly succeeding against a permissive stub.
    */
    const wellFormed =
      auth.startsWith('AWS4-HMAC-SHA256 ') &&
      auth.includes(`Credential=${MOCK_ACCESS_KEY}/`) &&
      /SignedHeaders=host;x-amz-content-sha256;x-amz-date/.test(auth) &&
      /Signature=[0-9a-f]{64}/.test(auth) &&
      typeof req.headers['x-amz-date'] === 'string' &&
      typeof req.headers['x-amz-content-sha256'] === 'string';

    if (!wellFormed) {
      res.writeHead(403).end('<Error><Code>SignatureDoesNotMatch</Code></Error>');
      return;
    }
    if (mode !== 'ok') {
      const status = mode === 'forbidden' ? 403 : mode === 'nobucket' ? 404 : 500;
      res.writeHead(status).end(`<Error><Code>${mode}</Code></Error>`);
      return;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] !== bucket) {
      res.writeHead(404).end('<Error><Code>NoSuchBucket</Code></Error>');
      return;
    }
    const key = segments.slice(1).join('/');

    if (key === '' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/xml' }).end(
        '<?xml version="1.0"?><ListBucketResult>' +
          [...objects.keys()].map((k) => `<Key>${k}</Key>`).join('') +
          '<IsTruncated>false</IsTruncated></ListBucketResult>',
      );
      return;
    }

    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        objects.set(key, {
          bytes: Buffer.concat(chunks),
          contentType: req.headers['content-type'] ?? 'application/octet-stream',
          lastModified: new Date(),
        });
        res.writeHead(200).end();
      });
      return;
    }

    const held = objects.get(key);

    if (req.method === 'HEAD') {
      if (!held) { res.writeHead(404).end(); return; }
      res.writeHead(200, {
        'Content-Type': held.contentType,
        'Content-Length': String(held.bytes.length),
        'Last-Modified': held.lastModified.toUTCString(),
      }).end();
      return;
    }
    if (req.method === 'GET') {
      if (!held) { res.writeHead(404).end(); return; }
      res.writeHead(200, {
        'Content-Type': held.contentType,
        'Last-Modified': held.lastModified.toUTCString(),
      }).end(held.bytes);
      return;
    }
    if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204).end();
      return;
    }
    res.writeHead(405).end();
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        objects,
        setMode: (m) => { mode = m; },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// Standalone: `node scripts/mock-s3.mjs --port 9401`
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('mock-s3.mjs')) {
  const mock = await startMockS3({
    port: Number(arg('port', '9401')),
    bucket: arg('bucket', 'ci-media-test'),
  });
  console.log(`mock S3 listening on http://127.0.0.1:${mock.port} (bucket ${arg('bucket', 'ci-media-test')})`);
}
