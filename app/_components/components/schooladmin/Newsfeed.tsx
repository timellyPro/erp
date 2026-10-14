"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useNewsFeeds } from "../../hooks/useNewsFeeds";
import TimellyLoader from "../common/TimellyLoader";
import CreatePost from "./newsfeed/CreatePost";
import PostCard from "./newsfeed/PostCard";

export default function NewsFeed() {
  const router = useRouter();
  const { feeds, loading, error, refetch, toggleLike, likingIds } = useNewsFeeds();

  const onPublished = useCallback(() => {
    void refetch();
    try {
      router.refresh();
    } catch {
      /* noop */
    }
  }, [refetch, router]);

  return (
    <div className="min-h-screen text-white font-sans p-3 sm:p-4 md:p-6 lg:p-8">
      <main className="max-w-3xl mx-auto space-y-4 md:space-y-6">
        <section className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold mb-1 md:mb-2 text-white">News Feed</h2>
          <p className="text-sm md:text-base text-gray-300">
            Create and manage school announcements. You can download images from each post. Posts older than 7 days are removed automatically to keep storage manageable.
          </p>
        </section>

        <CreatePost onPublished={onPublished} />

        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-500/30 px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && feeds.length === 0 ? (
          <TimellyLoader
            compact
            title="Loading newsfeed"
            steps={["Announcements", "Likes", "Media"]}
          />
        ) : feeds.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8 text-center text-white/60 text-sm sm:text-base">
            No posts yet. Create the first one above.
          </div>
        ) : (
          <div className="space-y-4 md:space-y-6">
            {feeds.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={toggleLike}
                isLiking={Boolean(likingIds[post.id])}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
