import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCP Todo Console",
  description: "Tiny UI for calling MCP todo tools",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
