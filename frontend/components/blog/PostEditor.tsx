"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPost, updatePost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { BLOG_BODY_MAX, BLOG_TITLE_MAX, type BlogPost } from "@/lib/types";
import { ErrorNote, Loading } from "../ui";
import { Byline, PostBody } from "./PostBits";
import { useIsAuthor } from "./PostView";

type Tab = "write" | "preview";

/** Write a new post, or edit one of your own (`postId`). */
export function PostEditor({ postId }: { postId: string | null }) {
  const existing = useApi<BlogPost>(postId ? `/api/blog/${encodeURIComponent(postId)}` : null);
  const mine = useIsAuthor(existing.data);
  if (!postId) return <Editor post={null} />;
  if (existing.error) return <ErrorNote message={existing.error} />;
  if (!existing.data) return <Loading label="Loading the post…" />;
  if (!mine) return <ErrorNote message="Only the author can edit this post." />;
  return <Editor post={existing.data} />;
}

function Editor({ post }: { post: BlogPost | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [tab, setTab] = useState<Tab>("write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = title.trim().length > 0 && body.trim().length > 0 && !busy;
  const now = new Date().toISOString();

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const input = { title: title.trim(), body: body.trim() };
      const saved = post ? await updatePost(post.post_id, input) : await createPost(input);
      router.push(`/blog?post=${encodeURIComponent(saved.post_id)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={post ? `/blog?post=${encodeURIComponent(post.post_id)}` : "/blog"} className="text-xs text-accent hover:underline">
          ← {post ? "Back to the post" : "All posts"}</Link>
        <div className="segmented" role="tablist" aria-label="Editor view">
          <button role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}>Write</button>
          <button role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")}>Preview</button>
        </div>
      </div>
      {tab === "write" ? (
        <form className="soft-card space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); if (ready) void publish(); }}>
          <label className="block space-y-1">
            <span className="flex justify-between text-xs text-ink-3">Title<span className="tabular">{title.length}/{BLOG_TITLE_MAX}</span></span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={BLOG_TITLE_MAX} required disabled={busy}
              placeholder="What did your robot learn?" className="w-full border border-line-strong bg-panel px-3 py-2.5 text-lg text-ink" />
          </label>
          <label className="block space-y-1">
            <span className="flex justify-between text-xs text-ink-3">Text<span className="tabular">{body.length}/{BLOG_BODY_MAX}</span></span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={BLOG_BODY_MAX} required disabled={busy} rows={14}
              placeholder="Leave a blank line between paragraphs."
              className="w-full resize-y border border-line-strong bg-panel px-3 py-2.5 text-[15px] leading-relaxed text-ink" />
          </label>
          {error && <ErrorNote message={error} />}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="submit" disabled={!ready} className="button-primary disabled:opacity-50">
              {busy ? "Publishing…" : post ? "Save changes" : "Publish"}</button>
          </div>
        </form>
      ) : (
        <article className="space-y-5" aria-label="Preview">
          <h1 className="text-[34px] leading-tight font-light tracking-[-0.025em]">{title.trim() || "Untitled"}</h1>
          <Byline post={{ author_name: post?.author_name ?? user?.name ?? "Guest", author_avatar: post?.author_avatar ?? user?.avatar_url ?? null,
            created_at: post?.created_at ?? now, updated_at: post?.updated_at ?? now }} />
          <div className="soft-card p-6 md:p-8">
            {body.trim() ? <PostBody body={body} /> : <p className="text-sm text-ink-3">Nothing written yet.</p>}
          </div>
        </article>
      )}
    </div>
  );
}
