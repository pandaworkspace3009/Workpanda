import type { ReactNode } from "react";

export const metadata = {
  title: "WorkPanda",
  description: "業務日曆・排班・股東結算",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-HK">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
