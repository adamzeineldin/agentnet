import { fmtDate } from "@/lib/format";
import type { BlogPostSummary } from "@/lib/types";

/** The writer's picture (or initial), name and date. */
export function Byline({ post }: { post: Pick<BlogPostSummary, "author_name" | "author_avatar" | "created_at" | "updated_at"> }) {
  const edited = post.updated_at.slice(0, 16) !== post.created_at.slice(0, 16);
  return (
    <p className="flex items-center gap-2 text-xs text-ink-3">
      {post.author_avatar
        // eslint-disable-next-line @next/next/no-img-element -- provider avatar URL
        ? <img src={post.author_avatar} alt="" className="size-6 rounded-full" referrerPolicy="no-referrer" />
        : <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-panel-2 text-[11px] text-ink-2">{post.author_name.slice(0, 1)}</span>}
      <span className="text-ink-2">{post.author_name}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={post.created_at}>{fmtDate(post.created_at)}</time>
      {edited && <span>· edited</span>}
    </p>
  );
}

/**
 * A post's text as plain paragraphs: blank lines split paragraphs, single line breaks stay. Rendered as text,
 * never as HTML, so nothing a writer types can run on a reader's page.
 */
export function PostBody({ body }: { body: string }) {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink">
      {paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
    </div>
  );
}
