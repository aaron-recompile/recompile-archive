import ArticleFilter from "../components/ArticleFilter";
import { getAllArticles, getAllSeries } from "../lib/server-api";

export const revalidate = 300;

export const metadata = {
  title: "Articles — Recompile Archive",
  description:
    "Every article in the archive: Bitcoin Script, Taproot, and OP_* opcodes on Signet.",
};

export default async function ArticlesListPage() {
  const [articles, series] = await Promise.all([
    getAllArticles(),
    getAllSeries(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-8 py-10">
      <ArticleFilter articles={articles} series={series} />
    </main>
  );
}
