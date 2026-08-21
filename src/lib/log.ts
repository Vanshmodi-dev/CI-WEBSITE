import 'server-only';

/**
 * Privacy-conscious structured logging.
 *
 * THE RULE: personal information never reaches a log line.
 *
 * Logs are read by whoever is on call, forwarded to a hosting provider, and
 * retained far longer than anyone intends. A name, phone number or message
 * body in a log is a copy of personal data outside the database, outside the
 * retention policy, and outside anything the visitor was told about.
 *
 * So we log the SHAPE of what happened, never the content:
 *   - which fields failed validation, not what they contained
 *   - an enquiry id, not the person it belongs to
 *   - an ipHash prefix for correlation, not the address
 */

type Level = 'info' | 'warn' | 'error';

/** Keys that must never appear in a log payload, at any nesting depth. */
const FORBIDDEN = new Set([
  'name',
  'studentname',
  'phone',
  'email',
  'message',
  'notes',
  'ip',
  'ipaddress',
  'consentref',
  'quote',
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'databaseurl',
]);

/**
 * Defence in depth: even if a caller passes something it should not, the key
 * is redacted rather than written. The allowlist discipline lives at the call
 * site; this is the net beneath it.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = FORBIDDEN.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return '[unloggable]';
}

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(data ? (redact(data) as Record<string, unknown>) : {}),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) => emit('error', event, data),
};

/**
 * Short prefix of an ipHash, for correlating repeated abuse across log lines
 * without carrying the full identifier around.
 */
export function ipHashPrefix(ipHash: string): string {
  return ipHash.slice(0, 12);
}

/**
 * Log an unexpected error without leaking internals.
 *
 * The stack goes to the server log; the caller gets a generic message and a
 * reference id. Master Plan §19: production error messages must not expose
 * internal details.
 */
export function logUnexpected(event: string, error: unknown): string {
  const ref = Math.random().toString(36).slice(2, 10);
  log.error(event, {
    ref,
    kind: error instanceof Error ? error.name : typeof error,
    // The message can contain a connection string on some driver errors, so it
    // is truncated hard and never included in production.
    detail:
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? error.message.slice(0, 300)
        : undefined,
  });
  return ref;
}
