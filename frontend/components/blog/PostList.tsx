"use client";

import Link from "next/link";
import { useApi } from "@/lib/useApi";
import type { BlogPostSummary } from "@/lib/types";
import { ErrorNote, Loading, PageHeader } from "../ui";
import { Byline } from "./PostBits";

function PostCard({ post, featured }: { post: BlogPostSummary; featured: boolean }) {
  return (
    <Link href={`/blog?post=${encodeURIComponent(post.post_id)}`}
      className={`soft-card flex flex-col gap-3 p-5 ${featured ? "md:col-span-2 md:p-7" : ""}`}>
      <h2 className={featured ? "text-2xl font-light tracking-[-0.02em]" : "text-lg font-normal tracking-[-0.01em]"}>{post.title}</h2>
      <p className={`text-sm text-ink-2 ${featured ? "" : "line-clamp-3"}`}>{post.excerpt}</p>
      <div className="mt-auto pt-1"><Byline post={post} /></div>
    </Link>
  );
}

/** Every post, newest first; `author` narrows to one writer ("Your posts" in the profile menu). */
export function PostList({ author }: { author: string | null }) {
  const posts = useApi<BlogPostSummary[]>(`/api/blog?limit=100${author ? `&author_id=${encodeURIComponent(author)}` : ""}`);
  const name = author && posts.data?.[0]?.author_name;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={name ? `Posts by ${name}` : "Blog"}
        actions={<Link href="/blog?write=1" className="button-primary">Write a post</Link>}>
        {author ? <Link href="/blog" className="text-accent hover:underline">← All posts</Link>
          : "What people taught their robots, what failed, and what they learned."}
      </PageHeader>
      {posts.error && <ErrorNote message={posts.error} />}
      {posts.loading && !posts.data && <Loading label="Loading posts…" />}
      {posts.data?.length === 0 && (
        <div className="soft-card space-y-3 p-10 text-center">
          <p className="text-lg font-light">{author ? "No posts yet." : "Nothing here yet."}</p>
          <Link href="/blog?write=1" className="button-secondary">Write the first post</Link>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {posts.data?.map((p, i) => <PostCard key={p.post_id} post={p} featured={i === 0 && !author} />)}
      </div>
    </div>
  );
}
