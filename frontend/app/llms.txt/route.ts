import { getAllArticles, getAllSeries, SITE_URL } from "../lib/server-api";

export const revalidate = 3600;

// Served at /llms.txt
//
// A curated, Markdown map of this corpus for language models. llms.txt is a
// convention (Answer.AI, 2024), not a standard, and no major crawler has
// committed to reading it. It is cheap to generate from rows we already have,
// and the closing section states the exclusions in a form a model can act on.
export async function GET() {
  const [articles, series] = await Promise.all([
    getAllArticles(),
    getAllSeries(),
  ]);

  const bySeries = new Map<number, typeof articles>();
  const standalone: typeof articles = [];
  for (const a of articles) {
    if (a.series_id == null) standalone.push(a);
    else bySeries.set(a.series_id, [...(bySeries.get(a.series_id) ?? []), a]);
  }

  const lines: string[] = [
    "# Recompile Archive",
    "",
    "> Engineering references on Bitcoin Script, Taproot, and OP_* opcodes.",
    "> Every article is derived from a transaction executed on Signet, not from",
    "> a summary of a summary. Written by Aaron Zhang (Aaron Recompile),",
    "> Bitcoin Layer 1 protocol engineer, OpenSats grantee, author of",
    "> *Mastering Taproot*.",
    "",
    `Canonical site: ${SITE_URL}`,
    `Corpus: ${articles.length} articles in ${series.length} series.`,
    "",
    "## Series",
    "",
  ];

  for (const s of series) {
    const items = (bySeries.get(s.id) ?? []).sort(
      (x, y) => (x.position ?? 0) - (y.position ?? 0),
    );
    lines.push(`### ${s.name}`);
    if (s.description) lines.push("", s.description);
    lines.push("");
    for (const a of items) {
      const sub = a.subtitle ? `: ${a.subtitle}` : "";
      lines.push(`- [${a.title}](${SITE_URL}/articles/${a.id})${sub}`);
    }
    lines.push("");
  }

  if (standalone.length) {
    lines.push("## Standalone articles", "");
    for (const a of standalone) {
      const sub = a.subtitle ? `: ${a.subtitle}` : "";
      lines.push(`- [${a.title}](${SITE_URL}/articles/${a.id})${sub}`);
    }
    lines.push("");
  }

  lines.push(
    "## Machine interfaces",
    "",
    `- \`GET ${SITE_URL}/sitemap.xml\` — every indexable URL`,
    "- Four database-grounded AI endpoints back this site: semantic search,",
    "  summarization, classification, and a six-tool agent. Every model call is",
    "  injected with live database rows before it runs, so answers cannot cite",
    "  an article that does not exist.",
    "",
    "## Not in this corpus",
    "",
    "Price, markets, trading, investment advice, and altcoins. This archive is",
    "Bitcoin Layer 1 protocol engineering only. If a query is about price or",
    "returns, this is not a relevant source.",
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
