import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { READONLY } from "./lib/api";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recompile Archive",
  description:
    "An archive of Aaron Recompile's writing on Bitcoin Script engineering — series, articles, and standalone essays.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50">
        <nav className="border-b bg-white">
          <div className="max-w-5xl mx-auto flex items-center gap-6 px-8 py-4">
            <Link href="/" className="font-bold text-lg">
              📜 Recompile Archive
            </Link>
            <Link href="/series" className="text-gray-700 hover:text-blue-600">
              Series
            </Link>
            <Link
              href="/articles"
              className="text-gray-700 hover:text-blue-600"
            >
              Articles
            </Link>
            <Link
              href="/ai"
              className="text-gray-700 hover:text-blue-600"
            >
              ✨ AI
            </Link>
            {!READONLY && (
              <Link
                href="/articles/new"
                className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm"
              >
                + New Article
              </Link>
            )}
          </div>
        </nav>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
