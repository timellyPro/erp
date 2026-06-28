"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  loadNewsFeeds,
  peekNewsFeeds,
  setNewsFeedsCache,
} from "@/lib/loadSchoolAdminFastTabs";

export interface NewsFeedItem {
  id: string;
  title: string;
  description: string;
  photo: string | null;
  photos?: string[];
  likes: number;
  likedByMe: boolean;
  createdBy: { id: string; name: string | null; email: string | null; photoUrl?: string | null };
  createdAt: string;
}

export function useNewsFeeds() {
  const [feeds, setFeeds] = useState<NewsFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likingIds, setLikingIds] = useState<Record<string, boolean>>({});
  const feedsRef = useRef<NewsFeedItem[]>([]);
  const likingIdsRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    feedsRef.current = feeds;
  }, [feeds]);

  useEffect(() => {
    likingIdsRef.current = likingIds;
  }, [likingIds]);

  const fetchFeeds = useCallback(async (revalidate = false) => {
    if (!revalidate) {
      const cached = peekNewsFeeds();
      if (cached) {
        feedsRef.current = cached;
        setFeeds(cached);
        setLoading(false);
        void fetchFeeds(true);
        return;
      }
    }

    setLoading(feedsRef.current.length === 0);
    setError(null);
    try {
      const list = await loadNewsFeeds({ revalidate });
      feedsRef.current = list;
      setFeeds(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading news feed");
      if (feedsRef.current.length === 0) setFeeds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  const toggleLike = useCallback(async (id: string) => {
    const currentFeed = feedsRef.current.find((feed) => feed.id === id);
    if (!currentFeed || likingIdsRef.current[id]) return;

    const nextLiked = !currentFeed.likedByMe;
    const nextLikes = Math.max(0, currentFeed.likes + (nextLiked ? 1 : -1));

    setLikingIds((prev) => ({ ...prev, [id]: true }));
    setFeeds((prev) =>
      {
        const next = prev.map((f) =>
          f.id === id
            ? { ...f, likedByMe: nextLiked, likes: nextLikes }
            : f
        );
        setNewsFeedsCache(next);
        return next;
      }
    );

    try {
      const res = await fetch(`/api/newsfeed/${id}/like`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update like");
      setFeeds((prev) =>
        {
          const next = prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  likes: typeof data.likes === "number" ? data.likes : nextLikes,
                  likedByMe: typeof data.liked === "boolean" ? data.liked : nextLiked,
                }
              : f
          );
          setNewsFeedsCache(next);
          return next;
        }
      );
    } catch {
      setFeeds((prev) =>
        {
          const next = prev.map((f) =>
            f.id === id
              ? { ...f, likedByMe: currentFeed.likedByMe, likes: currentFeed.likes }
              : f
          );
          setNewsFeedsCache(next);
          return next;
        }
      );
    } finally {
      setLikingIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, []);

  return { feeds, loading, error, refetch: fetchFeeds, toggleLike, likingIds };
}
