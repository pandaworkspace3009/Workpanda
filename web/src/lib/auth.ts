import { requireIdentity, requireTeamRole } from "../../cursor/identity.js";

export type AccessOk = {
  ok: true;
  actor: string;
  /** Tenant-scoped workspace row id — never a global shared "main". */
  workspaceId: string;
  visibility: "private" | "team";
};

const FAIL_WINDOW_MS = 60_000;
const FAIL_MAX = 20;
const failBuckets = new Map<string, { count: number; resetAt: number }>();
const noStore = { "cache-control": "private, no-store" };

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

function deny(
  key: string,
  status: number,
  error: string,
  hint: string,
  extra: Record<string, unknown> = {},
): Response {
  recordFailure(key);
  return Response.json(
    { error, hint, ...extra },
    { status, headers: noStore },
  );
}

/**
 * Financial cloud sync is Private/Team only.
 * - Public visibility (or anonymous) → rejected (no Postgres financial payload).
 * - API keys → rejected (persons only).
 * - Team → admin/member of that team; workspace scoped to teamId.
 * - Private → signed-in person for this app; workspace scoped to this app id
 *   (Cursor gate already limits who can open a private app to owner/invitees).
 */
export async function requireAppAccess(request: Request): Promise<AccessOk | Response> {
  const key = clientKey(request);
  if (rateLimited(key)) {
    return Response.json(
      { error: "rate_limited", hint: "Too many failed auth attempts. Try again in a minute." },
      { status: 429, headers: { ...noStore, "retry-after": "60" } },
    );
  }

  const identity = await requireIdentity(request);
  if (identity instanceof Response) {
    return deny(
      key,
      401,
      "unauthorized",
      "Cloud sync needs Private or Team publish with Cursor sign-in on each device.",
      { reason: "missing_identity" },
    );
  }

  if (identity.simulated) {
    return deny(
      key,
      401,
      "unauthorized",
      "Simulated/dev identity cannot access the cloud workspace.",
      { reason: "simulated_identity" },
    );
  }

  if (identity.kind !== "person") {
    return deny(
      key,
      403,
      "forbidden",
      "API keys cannot access WorkPanda financial data. Sign in as a person.",
      { reason: "key_not_allowed" },
    );
  }

  if (identity.appVisibility === "public") {
    return deny(
      key,
      403,
      "forbidden",
      "Cloud database sync is disabled for Public apps. Set Publish Settings to Private or Team.",
      { reason: "public_cloud_disabled" },
    );
  }

  if (identity.appVisibility === "team") {
    const member = requireTeamRole(identity, ["admin", "member"]);
    if (member instanceof Response) {
      return deny(
        key,
        403,
        "forbidden",
        "Only team admins and members can sync this workspace.",
        { reason: "team_role_denied" },
      );
    }
    const teamId = member.teamId;
    if (typeof teamId !== "number") {
      return deny(key, 403, "forbidden", "Missing team id on viewer.", {
        reason: "missing_team",
      });
    }
    return {
      ok: true,
      actor: `user:${member.sub}`,
      workspaceId: `team:${teamId}`,
      visibility: "team",
    };
  }

  if (identity.appVisibility === "private") {
    const appId = process.env.CURSOR_APP_ID?.trim() || "";
    // Local/dev has no CURSOR_APP_ID; scope to the signed-in person instead.
    const workspaceId = appId
      ? `private:app:${appId}`
      : `private:user:${identity.sub}`;
    return {
      ok: true,
      actor: `user:${identity.sub}`,
      workspaceId,
      visibility: "private",
    };
  }

  return deny(
    key,
    403,
    "forbidden",
    "Cloud sync requires a Private or Team Cursor app.",
    { reason: "unsupported_visibility" },
  );
}
