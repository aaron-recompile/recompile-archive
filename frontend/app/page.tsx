import Link from "next/link";
import { READONLY } from "./lib/api";
import { getAllArticles, getAllSeries } from "./lib/server-api";

export const revalidate = 300;

export default async function Home() {
  const [series, articles] = await Promise.all([
    getAllSeries(),
    getAllArticles(),
  ]);

  return (
    <main className="max-w-3xl mx-auto px-8 py-16">
      <h1 className="text-4xl font-bold mb-3">📜 Recompile Archive</h1>
      <p className="text-lg text-gray-700 mb-2">
        The personal archive of <strong>Aaron Recompile</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        Engineering essays and tutorials on Bitcoin Script, Taproot, OP_*
        opcodes on Signet, and the architectural ideas behind them — organized
        into series, plus standalone pieces.
      </p>

      <p className="text-sm text-gray-500 mb-8">
        Currently indexed: <strong>{series.length}</strong> series ·{" "}
        <strong>{articles.length}</strong> articles.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/series"
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded"
        >
          Browse series
        </Link>
        <Link
          href="/articles"
          className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-5 py-2 rounded"
        >
          All articles
        </Link>
        {!READONLY && (
          <Link
            href="/articles/new"
            className="border border-gray-400 text-gray-700 hover:bg-gray-100 px-5 py-2 rounded"
          >
            Add article
          </Link>
        )}
      </div>
    </main>
  );
}
