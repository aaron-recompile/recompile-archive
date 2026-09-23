import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteSeriesButton from "../../components/DeleteSeriesButton";
import { formatDate, READONLY } from "../../lib/api";
import { JsonLd, seriesGraph } from "../../lib/schema";
import { getSeriesDetail } from "../../lib/server-api";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const series = await getSeriesDetail(id);
  if (!series) return { title: "Series not found — Recompile Archive" };
  return {
    title: `${series.name} — Recompile Archive`,
    description:
      series.description ??
      `${series.articles.length} articles in the ${series.name} series.`,
    openGraph: {
      title: series.name,
      description: series.description ?? undefined,
      type: "website",
    },
  };
}

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const series = await getSeriesDetail(id);
  if (!series) notFound();

  return (
    <main className="max-w-3xl mx-auto px-8 py-10">
      <JsonLd data={seriesGraph(series, series.articles)} />

      <Link href="/series" className="text-blue-600 underline text-sm">
        ← Back to series
      </Link>

      <div className="mt-4 bg-white border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold">{series.name}</h1>
          {!READONLY && <DeleteSeriesButton id={series.id} />}
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
          {!READONLY && (
            <Link href="/articles/new" className="text-blue-600 underline">
              Add one →
            </Link>
          )}
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
