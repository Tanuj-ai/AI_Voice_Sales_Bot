import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI_Voice_Sales_Bot",
  description: "Make, record, and review FlowDesk sales calls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
