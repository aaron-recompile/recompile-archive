import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders the article's Markdown body on the server.
 *
 * This is the whole point of the exercise: before this, a crawler that does
 * not execute JavaScript received a title and a subtitle. Now it receives the
 * article. react-markdown does not pass raw HTML through unless rehype-raw is
 * added, so the Medium-converted bodies cannot inject markup.
 */
export default function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <article className="prose-archive">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </article>
  );
}
