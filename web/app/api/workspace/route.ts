import { requireAppAccess } from "../../../src/lib/auth";
import { getOrCreateWorkspace, saveWorkspace } from "../../../src/lib/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "cache-control": "private, no-store" };
/** Max JSON body size for workspace PUT (bytes). */
const MAX_BODY_BYTES = 512 * 1024;

export async function GET(request: Request) {
  const access = await requireAppAccess(request);
  if (access instanceof Response) return access;

  const ws = await getOrCreateWorkspace(access.workspaceId);
  return Response.json(
    {
      id: ws.id,
      visibility: access.visibility,
      updatedAt: ws.updatedAt,
      updatedBy: ws.updatedBy,
      data: ws.payload,
      sampleData: !process.env.DATABASE_URL?.trim(),
    },
    { headers: noStore },
  );
}

export async function PUT(request: Request) {
  const access = await requireAppAccess(request);
  if (access instanceof Response) return access;

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json(
      { error: "payload_too_large", maxBytes: MAX_BODY_BYTES },
      { status: 413, headers: noStore },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json(
      { error: "payload_too_large", maxBytes: MAX_BODY_BYTES },
      { status: 413, headers: noStore },
    );
  }

  let body: { data?: unknown; expectedUpdatedAt?: string | null };
  try {
    body = JSON.parse(raw) as { data?: unknown; expectedUpdatedAt?: string | null };
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return Response.json({ error: "missing_data" }, { status: 400, headers: noStore });
  }

  const result = await saveWorkspace(
    access.workspaceId,
    body.data as Record<string, unknown>,
    access.actor,
    body.expectedUpdatedAt ?? null,
  );

  if ("conflict" in result && result.conflict) {
    return Response.json(
      {
        error: "conflict",
        updatedAt: result.updatedAt,
        data: result.payload,
      },
      { status: 409, headers: noStore },
    );
  }

  return Response.json(
    {
      id: access.workspaceId,
      visibility: access.visibility,
      updatedAt: result.updatedAt,
      data: result.payload,
      sampleData: !process.env.DATABASE_URL?.trim(),
    },
    { headers: noStore },
  );
}
