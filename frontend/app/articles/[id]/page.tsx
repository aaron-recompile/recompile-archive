import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleBody from "../../components/ArticleBody";
import EditPlacement from "../../components/EditPlacement";
import { formatDate, READONLY } from "../../lib/api";
import { articleGraph, JsonLd } from "../../lib/schema";
import { getAllSeries, getArticle } from "../../lib/server-api";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article) return { title: "Article not found — Recompile Archive" };
  return {
    title: `${article.title} — Recompile Archive`,
    description: article.subtitle ?? undefined,
    openGraph: {
      title: article.title,
      description: article.subtitle ?? undefined,
      type: "article",
      publishedTime: article.published_at ?? undefined,
    },
  };
}

function originalLinkLabel(url: string): string {
  if (url.includes("delvingbitcoin.org")) return "Read on Delving Bitcoin";
  if (url.includes("medium.com")) return "Read on Medium";
  return "Read original";
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [article, allSeries] = await Promise.all([
    getArticle(id),
    READONLY ? Promise.resolve([]) : getAllSeries(),
  ]);
  if (!article) notFound();

  return (
    <main className="max-w-3xl mx-auto px-8 py-10">
      <JsonLd data={articleGraph(article)} />

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
              {originalLinkLabel(article.url)} ↗
            </a>
          </p>
        )}
      </div>

      {article.content ? (
        <div className="mt-6 bg-white border rounded-lg p-8">
          <ArticleBody markdown={article.content} />
          {article.url && (
            <p className="mt-10 pt-6 border-t text-sm text-gray-500">
              Originally published at{" "}
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                {new URL(article.url).hostname}
              </a>
              .
            </p>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-500">
          Full text is not in the archive for this piece yet; follow the link
          above to read it at the source.
        </p>
      )}

      {!READONLY && (
        <EditPlacement article={article} allSeries={allSeries} />
      )}
    </main>
  );
}
