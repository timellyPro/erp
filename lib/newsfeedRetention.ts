import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/** News feed posts are removed after this age (7 days). */
export const NEWSFEED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function getNewsFeedRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - NEWSFEED_MAX_AGE_MS);
}

/**
 * Deletes posts (and cascading likes) older than {@link NEWSFEED_MAX_AGE_MS}.
 * Invoked from routes that serve the feed so the database stays bounded.
 */
export async function purgeExpiredNewsFeeds(): Promise<{ deleted: number }> {
  const cutoff = getNewsFeedRetentionCutoff();
  try {
    const result = await prisma.newsFeed.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { deleted: result.count };
  } catch (e) {
    logger.warn("purgeExpiredNewsFeeds:", e);
    return { deleted: 0 };
  }
}
