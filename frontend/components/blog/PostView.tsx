"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deletePost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { BLOG_GUEST_ID, type BlogPost } from "@/lib/types";
import { ErrorNote, Loading } from "../ui";
import { Byline, PostBody } from "./PostBits";

/** Whether the visitor wrote this post: their account, or a guest post on a server with sign-in off. */
export function useIsAuthor(post: Pick<BlogPost, "author_id"> | null): boolean {
  const { config, user } = useAuth();
  if (!post || !config) return false;
  return user ? user.user_id === post.author_id : !config.required && post.author_id === BLOG_GUEST_ID;
}

/** One post to read; its author also gets Edit and Delete. */
export function PostView({ postId }: { postId: string }) {
  const post = useApi<BlogPost>(`/api/blog/${encodeURIComponent(postId)}`);
  const mine = useIsAuthor(post.data);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await deletePost(postId);
      router.push("/blog");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <Link href="/blog" className="text-xs text-accent hover:underline">← All posts</Link>
      {post.error && <ErrorNote message={post.error} />}
      {!post.data && !post.error && <Loading label="Loading the post…" />}
      {post.data && (
        <>
          <header className="space-y-3">
            <h1 className="text-[34px] leading-tight font-light tracking-[-0.025em]">{post.data.title}</h1>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Byline post={post.data} />
              {mine && (
                <div className="flex gap-2">
                  <Link href={`/blog?edit=${encodeURIComponent(postId)}`} className="pill text-xs">Edit</Link>
                  <button type="button" onClick={() => void remove()} disabled={busy} className="pill text-xs text-bad disabled:opacity-50">
                    {busy ? "Deleting…" : "Delete"}</button>
                </div>
              )}
            </div>
          </header>
          {error && <ErrorNote message={error} />}
          <div className="soft-card p-6 md:p-8"><PostBody body={post.data.body} /></div>
        </>
      )}
    </article>
  );
}
