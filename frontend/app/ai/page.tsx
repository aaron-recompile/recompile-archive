"use client";

import { useEffect, useRef, useState } from "react";

import { API_URL } from "../lib/api";

type Mode = "search" | "summarize" | "classify" | "agent";

type Article = {
  id: number;
  title: string;
  subtitle: string | null;
  series_id: number | null;
};

type SearchMatch = {
  article_id: number;
  title: string;
  relevance: "high" | "medium" | "low";
  why_relevant: string;
};

type AgentStep = {
  iteration: number;
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  agent_steps?: AgentStep[];
  iterations?: number;
};

const RELEVANCE_COLOR: Record<string, string> = {
  high: "bg-green-100 text-green-800 border-green-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-gray-100 text-gray-700 border-gray-300",
};

export default function AIPage() {
  const [mode, setMode] = useState<Mode>("search");

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Articles list (for picker dropdowns)
  const [articles, setArticles] = useState<Article[]>([]);
  useEffect(() => {
    fetch(`${API_URL}/articles`)
      .then((r) => r.json())
      .then(setArticles)
      .catch(() => {});
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">✨ AI Tools</h1>
        <p className="text-sm text-gray-600 mt-1">
          AI-augmented tools over your Bitcoin technical writing archive — search,
          summarize, classify, and act via an agent.
        </p>
      </header>

      {/* Mode tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b pb-3" role="tablist">
        {(
          [
            { id: "search", label: "🔍 Search" },
            { id: "summarize", label: "📝 Summarize" },
            { id: "classify", label: "🏷️ Classify" },
            { id: "agent", label: "🤖 Agent" },
          ] as { id: Mode; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              setMode(id);
              setError(null);
            }}
            className={
              mode === id
                ? "px-4 py-2 rounded bg-blue-600 text-white font-medium"
                : "px-4 py-2 rounded bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          <strong>Error:</strong> {error}
        </div>
      )}

      {mode === "search" && (
        <SearchPanel
          loading={loading}
          setLoading={setLoading}
          setError={setError}
        />
      )}
      {mode === "summarize" && (
        <SummarizePanel
          articles={articles}
          loading={loading}
          setLoading={setLoading}
          setError={setError}
        />
      )}
      {mode === "classify" && (
        <ClassifyPanel
          loading={loading}
          setLoading={setLoading}
          setError={setError}
        />
      )}
      {mode === "agent" && (
        <AgentPanel
          loading={loading}
          setLoading={setLoading}
          setError={setError}
        />
      )}
    </main>
  );
}

// ----------------------------------------------------------------------
// Search panel — natural-language query over articles
// ----------------------------------------------------------------------

function SearchPanel({
  loading,
  setLoading,
  setError,
}: {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    summary: string;
    matches: SearchMatch[];
  } | null>(null);

  async function go() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`${API_URL}/ai/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), limit: 5 }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="e.g., articles about Taproot control blocks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          disabled={loading}
          className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={go}
          disabled={loading || !query.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2 rounded font-medium"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {result && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 italic bg-blue-50 border border-blue-200 rounded px-3 py-2">
            {result.summary}
          </p>
          <ul className="space-y-2">
            {result.matches.map((m) => (
              <li
                key={m.article_id}
                className="bg-white border border-gray-200 rounded px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${
                      RELEVANCE_COLOR[m.relevance] || RELEVANCE_COLOR.low
                    }`}
                  >
                    {m.relevance}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/articles/${m.article_id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      [{m.article_id}] {m.title}
                    </a>
                    <p className="text-sm text-gray-600 mt-1">{m.why_relevant}</p>
                  </div>
                </div>
              </li>
            ))}
            {result.matches.length === 0 && (
              <li className="text-sm text-gray-500 italic">No matches.</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// Summarize panel — pick an article, get summary + key concepts
// ----------------------------------------------------------------------

function SummarizePanel({
  articles,
  loading,
  setLoading,
  setError,
}: {
  articles: Article[];
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const [articleId, setArticleId] = useState<number | "">("");
  const [result, setResult] = useState<{
    title: string;
    summary: string;
    key_concepts: string[];
  } | null>(null);

  async function go() {
    if (!articleId || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`${API_URL}/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article_id: articleId }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex gap-2">
        <select
          value={articleId}
          onChange={(e) =>
            setArticleId(e.target.value ? Number(e.target.value) : "")
          }
          disabled={loading}
          className="flex-1 border border-gray-300 rounded px-3 py-2"
        >
          <option value="">Pick an article…</option>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              [{a.id}] {a.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={go}
          disabled={loading || !articleId}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2 rounded font-medium"
        >
          {loading ? "Summarizing…" : "Summarize"}
        </button>
      </div>

      {result && (
        <div className="bg-white border border-gray-200 rounded px-5 py-4 space-y-3">
          <h3 className="text-lg font-semibold">{result.title}</h3>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
            {result.summary}
          </p>
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <span className="text-xs text-gray-500 mr-1">Key concepts:</span>
            {result.key_concepts.map((c, i) => (
              <span
                key={i}
                className="text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// Classify panel — paste a new article title/subtitle, get series suggestion
// ----------------------------------------------------------------------

function ClassifyPanel({
  loading,
  setLoading,
  setError,
}: {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [result, setResult] = useState<{
    suggested_series_id: number | null;
    suggested_series_name: string;
    confidence: string;
    reasoning: string;
    alternatives: { series_id: number; series_name: string }[];
  } | null>(null);

  async function go() {
    if (!title.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`${API_URL}/ai/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          subtitle: subtitle.trim() || null,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <input
        type="text"
        placeholder="Title (required) — e.g., Building a Schnorr Aggregator on Signet"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={loading}
        className="w-full border border-gray-300 rounded px-3 py-2"
      />
      <input
        type="text"
        placeholder="Subtitle (optional)"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
        disabled={loading}
        className="w-full border border-gray-300 rounded px-3 py-2"
      />
      <button
        type="button"
        onClick={go}
        disabled={loading || !title.trim()}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2 rounded font-medium"
      >
        {loading ? "Classifying…" : "Suggest series"}
      </button>

      {result && (
        <div className="bg-white border border-gray-200 rounded px-5 py-4 space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="text-sm text-gray-500">Suggested:</span>
            <span className="text-lg font-semibold">
              {result.suggested_series_name}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded border ${
                RELEVANCE_COLOR[result.confidence] || RELEVANCE_COLOR.low
              }`}
            >
              {result.confidence}
            </span>
          </div>
          <p className="text-sm text-gray-700">{result.reasoning}</p>
          {result.alternatives.length > 0 && (
            <div className="text-sm text-gray-600">
              <span className="text-xs text-gray-500 mr-2">Alternatives:</span>
              {result.alternatives.map((a) => (
                <span
                  key={a.series_id}
                  className="inline-block bg-gray-100 border border-gray-200 px-2 py-0.5 rounded mr-1"
                >
                  [{a.series_id}] {a.series_name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// Agent panel — natural-language commands that can act on the archive
// ----------------------------------------------------------------------

function AgentPanel({
  loading,
  setLoading,
  setError,
}: {
  loading: boolean;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/ai/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      const data = await r.json();
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        {
          role: "assistant",
          content: data.response,
          agent_steps: data.agent_steps,
          iterations: data.iterations,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) => [...prev, { role: "user", content: text }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-3">
      <div
        ref={scrollRef}
        className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3 h-[440px] overflow-y-auto"
      >
        {messages.length === 0 && !loading && (
          <p className="text-gray-400 italic text-center mt-12">
            Try: &quot;Find articles about Taproot, then suggest a series for a new
            article on MuSig2&quot; · &quot;What did I write about SIGHASH?&quot; ·
            &quot;List all series with article counts&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <div
              className={
                m.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-br-sm whitespace-pre-wrap"
                    : "max-w-[85%] bg-white text-gray-900 px-4 py-2 rounded-2xl rounded-bl-sm border border-gray-200 whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            </div>
            {m.role === "assistant" &&
              m.agent_steps &&
              m.agent_steps.length > 0 && (
                <div className="ml-2 mt-2 max-w-[85%]">
                  <details className="text-xs text-gray-500 bg-white border border-gray-200 rounded px-3 py-2">
                    <summary className="cursor-pointer font-medium hover:text-gray-900">
                      🔧 {m.agent_steps.length} tool call
                      {m.agent_steps.length === 1 ? "" : "s"}
                      {m.iterations !== undefined &&
                        `, ${m.iterations} iteration${
                          m.iterations === 1 ? "" : "s"
                        }`}
                    </summary>
                    <div className="mt-2 space-y-2">
                      {m.agent_steps.map((s, j) => (
                        <details
                          key={j}
                          className="bg-gray-50 rounded px-2 py-1 border border-gray-100"
                        >
                          <summary className="cursor-pointer">
                            <span className="text-gray-400">
                              [iter {s.iteration}]
                            </span>{" "}
                            <span className="font-mono text-blue-700">
                              {s.tool}
                            </span>
                            <span className="text-gray-400">
                              ({Object.keys(s.input).join(", ") || "no args"})
                            </span>
                          </summary>
                          <div className="mt-1 pl-2 space-y-1">
                            <pre className="font-mono text-[11px] overflow-x-auto">
                              input: {JSON.stringify(s.input, null, 2)}
                            </pre>
                            <pre className="font-mono text-[11px] overflow-x-auto">
                              result:{" "}
                              {JSON.stringify(s.result, null, 2).slice(0, 600)}
                              {JSON.stringify(s.result).length > 600 && "…"}
                            </pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                </div>
              )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-500 px-4 py-2 rounded-2xl rounded-bl-sm border border-gray-200 italic">
              <span className="inline-block animate-pulse">
                Thinking and calling tools…
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          disabled={loading}
          placeholder="Tell the agent what to do…"
          className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2 rounded font-medium"
        >
          Send
        </button>
      </div>
    </section>
  );
}
