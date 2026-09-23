import Link from "next/link";
import { getSeriesWithCounts } from "../lib/server-api";

export const revalidate = 300;

export const metadata = {
  title: "Series — Recompile Archive",
  description:
    "Article series on Bitcoin Script, Taproot, and experimental opcodes run on Signet.",
};

export default async function SeriesListPage() {
  const series = await getSeriesWithCounts();

  return (
    <main className="max-w-5xl mx-auto px-8 py-10">
      <h1 className="text-3xl font-bold mb-6">Series</h1>

      {series.length === 0 ? (
        <p className="text-gray-600">No series yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {series.map((s) => (
            <Link
              key={s.id}
              href={`/series/${s.id}`}
              className="block border rounded-lg p-5 bg-white hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-2 gap-3">
                <h2 className="text-lg font-semibold">{s.name}</h2>
                <span className="shrink-0 text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">
                  {s.article_count}{" "}
                  {s.article_count === 1 ? "article" : "articles"}
                </span>
              </div>
              {s.description && (
                <p className="text-sm text-gray-600">{s.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
