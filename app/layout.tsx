import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "WorkPanda — 業務日曆・排班・股東結算",
  description: "多裝置業務日曆・排班出糧・股東分帳",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-HK">
      <head>
        <link rel="stylesheet" href="/css/app.css" />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
