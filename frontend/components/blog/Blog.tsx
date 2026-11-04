"use client";

import { useSearchParams } from "next/navigation";
import { SignInGate } from "../auth/SignInGate";
import { PostEditor } from "./PostEditor";
import { PostList } from "./PostList";
import { PostView } from "./PostView";

const WRITE_POINTS = ["Share what your robots learned", "Edit or delete your own posts", "Readable by everyone"];

/**
 * The blog, one page with its state in the URL (the cloud copy is a static export, so no per-post routes):
 * ?post=id reads a post, ?write=1 or ?edit=id opens the editor (signed-in), ?author=id lists one writer's posts.
 */
export function Blog() {
  const params = useSearchParams();
  const post = params.get("post");
  const edit = params.get("edit");
  if (params.get("write") || edit) {
    return (
      <SignInGate title="Write for the blog" points={WRITE_POINTS}>
        <PostEditor key={edit ?? "new"} postId={edit} />
      </SignInGate>
    );
  }
  if (post) return <PostView key={post} postId={post} />;
  return <PostList author={params.get("author")} />;
}
