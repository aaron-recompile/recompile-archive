"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL, Series } from "../lib/api";

interface SeriesWithCount extends Series {
  article_count: number;
}

export default function SeriesListPage() {
  const [series, setSeries] = useState<SeriesWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const list: Series[] = await (await fetch(`${API_URL}/series`)).json();
        const withCounts: SeriesWithCount[] = await Promise.all(
          list.map(async (s) => {
            const detail = await (await fetch(`${API_URL}/series/${s.id}`)).json();
            return { ...s, article_count: detail.articles.length };
          })
        );
        setSeries(withCounts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load series");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="p-8 text-gray-600">Loading series…</p>;
  if (error) return <p className="p-8 text-red-600">Error: {error}</p>;

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
