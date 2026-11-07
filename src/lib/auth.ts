import { requireIdentity } from "../../cursor/identity.js";

export type AccessOk = { ok: true; actor: string };

const FAIL_WINDOW_MS = 60_000;
const FAIL_MAX = 20;
const failBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return `ip:${fwd}`;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return `ip:${real}`;
  return "ip:unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = failBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    failBuckets.set(key, { count: 0, resetAt: now + FAIL_WINDOW_MS });
    return false;
  }
  return bucket.count >= FAIL_MAX;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const bucket = failBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    failBuckets.set(key, { count: 1, resetAt: now + FAIL_WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

/**
 * Cloud workspace access requires a verified Cursor viewer
 * (Private / Team publish). No shared-password gate.
 */
export async function requireAppAccess(request: Request): Promise<AccessOk | Response> {
  const key = clientKey(request);
  if (rateLimited(key)) {
    return Response.json(
      { error: "rate_limited", hint: "Too many failed auth attempts. Try again in a minute." },
      {
        status: 429,
        headers: {
          "cache-control": "private, no-store",
          "retry-after": "60",
        },
      },
    );
  }

  const identity = await requireIdentity(request);
  if (identity instanceof Response) {
    recordFailure(key);
    return Response.json(
      {
        error: "unauthorized",
        reason: "missing_identity",
        hint: "Cloud sync needs a Private or Team publish with Cursor sign-in on each device.",
      },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  }

  const actor =
    identity.kind === "key" ? `key:${identity.sub}` : `user:${identity.sub}`;
  return { ok: true, actor };
}
