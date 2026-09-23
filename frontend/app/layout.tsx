import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { READONLY } from "./lib/api";
import "./globals.css";
import { JsonLd, siteGraph } from "./lib/schema";
import { getAllArticles, getAllSeries, SITE_URL } from "./lib/server-api";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Recompile Archive",
    template: "%s",
  },
  description:
    "An archive of Aaron Recompile's writing on Bitcoin Script engineering — series, articles, and standalone essays.",
  authors: [{ name: "Aaron Zhang", url: "https://github.com/aaron-recompile" }],
  openGraph: {
    siteName: "Recompile Archive",
    type: "website",
    url: SITE_URL,
    title: "Recompile Archive",
    description:
      "Engineering references on Bitcoin Script, Taproot, and OP_* opcodes, derived from transactions executed on Signet.",
  },
  alternates: { canonical: "/" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Counts feed the WebSite description, so the sitewide graph states the real
  // size of the corpus rather than a number that goes stale in source.
  const [series, articles] = await Promise.all([
    getAllSeries(),
    getAllArticles(),
  ]);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50">
        <JsonLd data={siteGraph(series.length, articles.length)} />
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
