export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness only — no config fingerprints. */
export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
