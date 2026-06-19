// Shared API types and helpers — used by every page.

export const API_URL = process.env.NEXT_PUBLIC_API_URL!;

// Public deployments build with NEXT_PUBLIC_READONLY=1 to hide all
// create/edit/delete UI — the public site is browse + AI tools only.
// Local dev leaves it unset (full CRUD UI = internal editing interface).
export const READONLY = process.env.NEXT_PUBLIC_READONLY === "1";

export interface Series {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

export interface Article {
  id: number;
  title: string;
  subtitle: string | null;
  published_at: string | null;
  url: string | null;
  position: number | null;
  series_id: number | null;
}

export interface SeriesWithArticles extends Series {
  articles: Article[];
}

export interface ArticleWithSeries extends Article {
  series: Series | null;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
