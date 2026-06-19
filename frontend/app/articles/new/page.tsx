"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_URL, READONLY, Series } from "../../lib/api";

export default function NewArticlePage() {
  const router = useRouter();

  const [series, setSeries] = useState<Series[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [url, setUrl] = useState("");
  const [seriesId, setSeriesId] = useState<string>("");
  const [position, setPosition] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/series`);
        if (!res.ok) throw new Error(`Series request failed: ${res.status}`);
        setSeries(await res.json());
      } catch (err) {
        setSeriesError(
          err instanceof Error ? err.message : "Failed to load series"
        );
      } finally {
        setSeriesLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const body: Record<string, unknown> = { title };
    if (subtitle) body.subtitle = subtitle;
    if (publishedAt) body.published_at = publishedAt;
    if (url) body.url = url;
    if (seriesId !== "") body.series_id = parseInt(seriesId, 10);
    if (position !== "") body.position = parseInt(position, 10);

    try {
      const res = await fetch(`${API_URL}/articles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }
      router.push("/articles");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsSubmitting(false);
    }
  }

  if (READONLY) {
    return (
      <main className="max-w-2xl mx-auto px-8 py-10">
        <p className="text-gray-600">
          This archive is read-only.{" "}
          <Link href="/articles" className="text-blue-600 underline">
            ← Back to list
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Add an Article</h1>
        <Link href="/articles" className="text-blue-600 underline">
          ← Back to list
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-white border rounded-lg p-6"
      >
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="title">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="subtitle">
            Subtitle / abstract
          </label>
          <textarea
            id="subtitle"
            rows={2}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="date">
              Published date
            </label>
            <input
              id="date"
              type="date"
              value={publishedAt}
              onChange={(e) => setPublishedAt(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="url">
              External URL
            </label>
            <input
              id="url"
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="series">
              Series
            </label>
            {seriesLoading ? (
              <p className="text-sm text-gray-400">Loading series…</p>
            ) : seriesError ? (
              <p className="text-sm text-red-600">{seriesError}</p>
            ) : (
              <select
                id="series"
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value)}
                className="w-full border rounded px-3 py-2 bg-white"
              >
                <option value="">— Standalone (no series) —</option>
                {series.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="position"
            >
              Position
            </label>
            <input
              id="position"
              type="number"
              min={1}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="—"
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">Error: {error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          {isSubmitting ? "Saving…" : "Save Article"}
        </button>
      </form>
    </main>
  );
}
