import type { MetadataRoute } from "next";
import { getAllArticles, getAllSeries, SITE_URL } from "./lib/server-api";

export const revalidate = 3600;

// Served at /sitemap.xml
//
// This is load-bearing, not a nicety: the links to articles and series are
// rendered client-side, so a crawler that does not execute JavaScript cannot
// discover a single article by following links. The sitemap is currently the
// only path by which those 28 URLs are reachable.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, series] = await Promise.all([
    getAllArticles(),
    getAllSeries(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/articles`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/series`, changeFrequency: "weekly", priority: 0.8 },
  ];

  const seriesRoutes: MetadataRoute.Sitemap = series.map((s) => ({
    url: `${SITE_URL}/series/${s.id}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${SITE_URL}/articles/${a.id}`,
    lastModified: a.published_at ? new Date(a.published_at) : undefined,
    changeFrequency: "yearly",
    priority: 0.9,
  }));

  return [...staticRoutes, ...seriesRoutes, ...articleRoutes];
}
