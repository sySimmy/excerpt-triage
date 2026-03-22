import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Excerpt Triage",
  description: "摘录分拣台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className="antialiased">{children}</body>
    </html>
  );
}
