import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Prefer the static SPA shell; keeps / working even if only public/ is CDN-served via index.html. */
export default function HomePage() {
  redirect("/index.html");
}
