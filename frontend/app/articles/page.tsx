"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL, Article, Series, formatDate } from "../lib/api";

export default function ArticlesListPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const [a, s] = await Promise.all([
          fetch(`${API_URL}/articles`).then((r) => r.json()),
          fetch(`${API_URL}/series`).then((r) => r.json()),
        ]);
        setArticles(a);
        setSeries(s);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const seriesById = new Map(series.map((s) => [s.id, s.name]));

  const filtered = filter
    ? articles.filter((a) =>
        filter === "standalone"
          ? a.series_id === null
          : a.series_id === Number(filter)
      )
    : articles;

  if (loading) return <p className="p-8 text-gray-600">Loading articles…</p>;
  if (error) return <p className="p-8 text-red-600">Error: {error}</p>;

  return (
    <main className="max-w-5xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Articles</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600" htmlFor="filter">
            Series:
          </label>
          <select
            id="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">All</option>
            <option value="standalone">Standalone only</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Link
            href="/articles/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm"
          >
            + New
          </Link>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-600">No articles match this filter.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((a) => (
            <li
              key={a.id}
              className="bg-white border rounded-lg p-4 hover:shadow-md transition"
            >
              <Link href={`/articles/${a.id}`} className="block">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="font-semibold">{a.title}</h2>
                    {a.subtitle && (
                      <p className="text-sm text-gray-600 mt-1">{a.subtitle}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500 shrink-0">
                    <div>{formatDate(a.published_at)}</div>
                    {a.series_id !== null && (
                      <div className="mt-1 inline-block bg-gray-100 px-2 py-0.5 rounded">
                        {seriesById.get(a.series_id) ?? `series ${a.series_id}`}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
