"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_URL, ArticleWithSeries, Series } from "../lib/api";

/**
 * The only interactive part of an article page. Everything above it — title,
 * subtitle, dates, series, outbound link — is server-rendered, so the page has
 * full content in the HTML whether or not this component ever hydrates.
 */
export default function EditPlacement({
  article,
  allSeries,
}: {
  article: ArticleWithSeries;
  allSeries: Series[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editSeriesId, setEditSeriesId] = useState(
    article.series_id !== null ? String(article.series_id) : "",
  );
  const [editPosition, setEditPosition] = useState(
    article.position !== null ? String(article.position) : "",
  );

  const isDirty =
    editSeriesId !==
      (article.series_id !== null ? String(article.series_id) : "") ||
    editPosition !==
      (article.position !== null ? String(article.position) : "");

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/articles/${article.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          series_id: editSeriesId === "" ? null : parseInt(editSeriesId, 10),
          position: editPosition === "" ? null : parseInt(editPosition, 10),
        }),
      });
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      router.refresh();
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
      const res = await fetch(`${API_URL}/articles/${article.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      router.push("/articles");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 bg-white border rounded-lg p-6">
      <h2 className="font-semibold mb-4">Edit placement</h2>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="edit-series">
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
  );
}
