// Server-only API helpers.
//
// The browser talks to the backend through NEXT_PUBLIC_API_URL (a public
// hostname). Server-rendered routes — robots, sitemap, llms.txt — run inside
// the frontend container, where the backend is reachable as the compose
// service name. Keep the two separate: a server fetch to the public hostname
// has to leave and re-enter the host, and fails during build when DNS for the
// public name is not yet pointed at this machine.

import type {
  Article,
  ArticleWithSeries,
  Series,
  SeriesWithArticles,
} from "./api";

/** Base URL the SERVER uses to reach the backend. Never sent to the browser. */
export const INTERNAL_API_URL =
  process.env.API_URL_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://backend:8000";

/** Canonical public origin of this site, no trailing slash. */
export const SITE_URL = (
  process.env.SITE_URL ?? "https://archive.bitcoincoding.dev"
).replace(/\/$/, "");

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${INTERNAL_API_URL}${path}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    // A sitemap that is briefly missing entries beats a build that fails.
    return fallback;
  }
}

export const getAllArticles = () => getJSON<Article[]>("/articles", []);
export const getAllSeries = () => getJSON<Series[]>("/series", []);

/**
 * Fetch one resource. Returns null on 404 so the caller can call notFound(),
 * and throws on other failures so a broken backend surfaces as an error page
 * rather than a silent "not found".
 */
async function getOne<T>(path: string): Promise<T | null> {
  const res = await fetch(`${INTERNAL_API_URL}${path}`, {
    next: { revalidate: 300 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const getArticle = (id: string) =>
  getOne<ArticleWithSeries>(`/articles/${id}`);

export const getSeriesDetail = (id: string) =>
  getOne<SeriesWithArticles>(`/series/${id}`);

export interface SeriesWithCount extends Series {
  article_count: number;
}

/** Series list with article counts, resolved server-side. */
export async function getSeriesWithCounts(): Promise<SeriesWithCount[]> {
  const list = await getAllSeries();
  return Promise.all(
    list.map(async (s) => {
      const detail = await getJSON<SeriesWithArticles | null>(
        `/series/${s.id}`,
        null,
      );
      return { ...s, article_count: detail?.articles.length ?? 0 };
    }),
  );
}
