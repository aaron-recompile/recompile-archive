"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import {
  API_URL,
  ArticleWithSeries,
  Series,
  formatDate,
} from "../../lib/api";

export default function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [article, setArticle] = useState<ArticleWithSeries | null>(null);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Edit state — local, applied on Save
  const [editSeriesId, setEditSeriesId] = useState<string>("");
  const [editPosition, setEditPosition] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const [a, s] = await Promise.all([
          fetch(`${API_URL}/articles/${id}`).then(async (r) => {
            if (r.status === 404) throw new Error("Article not found");
            if (!r.ok) throw new Error(`Request failed: ${r.status}`);
            return r.json();
          }),
          fetch(`${API_URL}/series`).then((r) => r.json()),
        ]);
        setArticle(a);
        setAllSeries(s);
        setEditSeriesId(a.series_id !== null ? String(a.series_id) : "");
        setEditPosition(a.position !== null ? String(a.position) : "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function save() {
    if (!article) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        series_id: editSeriesId === "" ? null : parseInt(editSeriesId, 10),
        position: editPosition === "" ? null : parseInt(editPosition, 10),
      };
      const res = await fetch(`${API_URL}/articles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      const updated = await res.json();
      // Re-fetch with series populated
      const fresh = await fetch(`${API_URL}/articles/${id}`).then((r) =>
        r.json()
      );
      setArticle(fresh);
      setEditSeriesId(
        updated.series_id !== null ? String(updated.series_id) : ""
      );
      setEditPosition(updated.position !== null ? String(updated.position) : "");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteArticle() {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/articles/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      router.push("/articles");
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
        <Link href="/articles" className="text-blue-600 underline">
          ← Back to articles
        </Link>
      </main>
    );
  if (!article) return null;

  const isDirty =
    editSeriesId !== (article.series_id !== null ? String(article.series_id) : "") ||
    editPosition !== (article.position !== null ? String(article.position) : "");

  return (
    <main className="max-w-3xl mx-auto px-8 py-10">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/articles" className="text-blue-600 underline">
          ← All articles
        </Link>
        {article.series && (
          <Link
            href={`/series/${article.series.id}`}
            className="text-blue-600 underline"
          >
            ← Back to series: {article.series.name}
          </Link>
        )}
      </div>

      <div className="mt-4 bg-white border rounded-lg p-6">
        <h1 className="text-2xl font-bold mb-2">{article.title}</h1>
        {article.subtitle && (
          <p className="text-gray-700 mb-3">{article.subtitle}</p>
        )}
        <p className="text-xs text-gray-500 mb-1">
          Published: {formatDate(article.published_at)}
        </p>
        {article.series && (
          <p className="text-xs text-gray-500">
            Series:{" "}
            <Link
              href={`/series/${article.series.id}`}
              className="text-blue-600 underline"
            >
              {article.series.name}
            </Link>
            {article.position !== null && ` · #${article.position}`}
          </p>
        )}
        {article.url && (
          <p className="mt-3">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-sm"
            >
              Read on Medium ↗
            </a>
          </p>
        )}
      </div>

      <div className="mt-6 bg-white border rounded-lg p-6">
        <h2 className="font-semibold mb-4">Edit placement</h2>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4 mb-4">
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="edit-series"
            >
              Series
            </label>
            <select
              id="edit-series"
              value={editSeriesId}
              onChange={(e) => setEditSeriesId(e.target.value)}
              className="w-full border rounded px-3 py-2 bg-white"
            >
              <option value="">— Standalone —</option>
              {allSeries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="edit-position"
            >
              Position
            </label>
            <input
              id="edit-position"
              type="number"
              min={1}
              value={editPosition}
              onChange={(e) => setEditPosition(e.target.value)}
              placeholder="—"
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <div className="flex justify-between">
          <button
            disabled={busy || !isDirty}
            onClick={save}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button
            disabled={busy}
            onClick={deleteArticle}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded"
          >
            Delete article
          </button>
        </div>
      </div>
    </main>
  );
}
