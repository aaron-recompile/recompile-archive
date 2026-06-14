"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL } from "./lib/api";

interface Counts {
  series: number;
  articles: number;
}

export default function Home() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [s, a] = await Promise.all([
          fetch(`${API_URL}/series`).then((r) => r.json()),
          fetch(`${API_URL}/articles`).then((r) => r.json()),
        ]);
        setCounts({ series: s.length, articles: a.length });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load counts");
      }
    }
    load();
  }, []);

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

      {error ? (
        <p className="text-red-600 mb-6">Error loading counts: {error}</p>
      ) : counts ? (
        <p className="text-sm text-gray-500 mb-8">
          Currently indexed: <strong>{counts.series}</strong> series ·{" "}
          <strong>{counts.articles}</strong> articles.
        </p>
      ) : (
        <p className="text-sm text-gray-400 mb-8">Loading counts…</p>
      )}

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
        <Link
          href="/articles/new"
          className="border border-gray-400 text-gray-700 hover:bg-gray-100 px-5 py-2 rounded"
        >
          Add article
        </Link>
      </div>
    </main>
  );
}
