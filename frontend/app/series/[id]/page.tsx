"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import {
  API_URL,
  READONLY,
  SeriesWithArticles,
  formatDate,
} from "../../lib/api";

export default function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [series, setSeries] = useState<SeriesWithArticles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/series/${id}`);
        if (res.status === 404) throw new Error("Series not found");
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        setSeries(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function deleteSeries() {
    if (
      !confirm(
        "Delete this series? All articles in it will also be deleted (cascade)."
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/series/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      router.push("/series");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  if (loading) return <p className="p-8 text-gray-600">Loading…</p>;
  if (error)
    return (
      <main className="max-w-3xl mx-auto px-8 py-10">
        <p className="text-red-600 mb-4">Error: {error}</p>
        <Link href="/series" className="text-blue-600 underline">
          ← Back to series
        </Link>
      </main>
    );
  if (!series) return null;

  return (
    <main className="max-w-3xl mx-auto px-8 py-10">
      <Link href="/series" className="text-blue-600 underline text-sm">
        ← Back to series
      </Link>

      <div className="mt-4 bg-white border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold">{series.name}</h1>
          {!READONLY && (
            <button
              disabled={busy}
              onClick={deleteSeries}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded text-sm"
            >
              Delete series
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-3">slug: {series.slug}</p>
        {series.description && (
          <p className="text-gray-700">{series.description}</p>
        )}
      </div>

      <h2 className="text-xl font-semibold mt-8 mb-3">
        Articles ({series.articles.length})
      </h2>

      {series.articles.length === 0 ? (
        <p className="text-gray-600 text-sm">
          No articles in this series yet.{" "}
          <Link
            href="/articles/new"
            className="text-blue-600 underline"
          >
            Add one →
          </Link>
        </p>
      ) : (
        <ol className="space-y-3">
          {series.articles.map((a) => (
            <li
              key={a.id}
              className="bg-white border rounded-lg p-4 hover:shadow-md transition"
            >
              <Link href={`/articles/${a.id}`} className="block">
                <div className="flex items-start gap-3">
                  {a.position !== null && (
                    <span className="text-sm font-mono text-gray-400 mt-0.5">
                      #{a.position}
                    </span>
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{a.title}</h3>
                    {a.subtitle && (
                      <p className="text-sm text-gray-600 mt-1">{a.subtitle}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {formatDate(a.published_at)}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
