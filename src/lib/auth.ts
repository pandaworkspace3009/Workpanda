import { timingSafeEqual } from "node:crypto";
import { getIdentity } from "../../cursor/identity.js";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type AccessOk = { ok: true; actor: string };

/**
 * Allow access when Cursor identity is verified (private/team),
 * or when the request carries WORKPANDA_SYNC_TOKEN (public multi-device).
 */
export async function requireAppAccess(request: Request): Promise<AccessOk | Response> {
  const identity = await getIdentity(request);
  if (identity.verified) {
    const actor =
      identity.kind === "key"
        ? `key:${identity.sub}`
        : `user:${identity.sub}`;
    return { ok: true, actor };
  }

  const expected = process.env.WORKPANDA_SYNC_TOKEN?.trim() ?? "";
  if (expected) {
    const headerToken = request.headers.get("x-workpanda-token")?.trim() ?? "";
    const auth = request.headers.get("authorization") ?? "";
    const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const got = headerToken || bearer;
    if (got && safeEqual(got, expected)) {
      return { ok: true, actor: "token:shared" };
    }
  }

  return Response.json(
    {
      error: "unauthorized",
      reason: identity.reason || "missing_credentials",
      hint:
        "Use a Private/Team publish (Cursor sign-in), or set WORKPANDA_SYNC_TOKEN and enter the same access code on each device.",
    },
    { status: 401, headers: { "cache-control": "private, no-store" } },
  );
}
