import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reelo — Bring your customers back",
  description:
    "Reelo finds the customers worth contacting, helps you write the right message, and makes it easy to reach them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
