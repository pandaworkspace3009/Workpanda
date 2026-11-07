export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lightweight probe that the Next server (not static CDN) is serving routes. */
export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "workpanda",
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
