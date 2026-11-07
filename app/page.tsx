import Script from "next/script";
import { SPA_BODY } from "../src/spa/body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serve the WorkPanda SPA through Next (not public/index.html) so the host
 * deploys as a Next.js app with /api/* server routes instead of static-only CDN.
 */
export default function HomePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: SPA_BODY }} />
      <Script src="/js/store.js" strategy="beforeInteractive" />
      <Script src="/js/calc.js" strategy="beforeInteractive" />
      <Script src="/js/app.js" strategy="afterInteractive" />
    </>
  );
}
