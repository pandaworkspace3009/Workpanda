import { requireAppAccess } from "../../../src/lib/auth";
import { getOrCreateWorkspace, saveWorkspace } from "../../../src/lib/workspace";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const access = await requireAppAccess(request);
  if (access instanceof Response) return access;

  const ws = await getOrCreateWorkspace();
  return Response.json(
    {
      id: "main",
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

  let body: { data?: unknown; expectedUpdatedAt?: string | null };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  if (!body.data || typeof body.data !== "object") {
    return Response.json({ error: "missing_data" }, { status: 400, headers: noStore });
  }

  const result = await saveWorkspace(
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
      id: "main",
      updatedAt: result.updatedAt,
      data: result.payload,
      sampleData: !process.env.DATABASE_URL?.trim(),
    },
    { headers: noStore },
  );
}
