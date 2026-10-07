import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { purgeExpiredNewsFeeds } from "@/lib/newsfeedRetention";

const NEWSFEED_PURGE_INTERVAL_MS = 5 * 60 * 1000;
let lastPurgeStartedAt = 0;

async function getSchoolId(session: { user: { id: string; schoolId?: string | null } }) {
  let schoolId = session.user.schoolId;
  if (!schoolId) {
    const adminSchool = await prisma.school.findFirst({
      where: { admins: { some: { id: session.user.id } } },
      select: { id: true },
    });
    schoolId = adminSchool?.id ?? null;
  }
  return schoolId;
}

type FeedRow = {
  id: string;
  title: string;
  description: string;
  photo: string | null;
  photos: string[] | null;
  likes: number;
  schoolId: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  creatorId: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
};

type LikeRow = { newsFeedId: string };

function mapFeedsToResponse(
  feeds: FeedRow[],
  likedSet: Set<string>
) {
  return feeds.map((f) => {
    const photos =
      Array.isArray(f.photos) && f.photos.length > 0
        ? f.photos
        : f.photo
          ? [f.photo]
          : [];
    const mainPhoto = f.photo ?? photos[0] ?? null;
    return {
      id: f.id,
      title: f.title,
      description: f.description,
      photo: mainPhoto,
      photos,
      mediaUrl: mainPhoto,
      mediaType: mainPhoto ? "PHOTO" : null,
      likes: f.likes ?? 0,
      schoolId: f.schoolId,
      createdById: f.createdById,
      createdBy: {
        id: f.creatorId ?? f.createdById,
        name: f.creatorName ?? null,
        email: f.creatorEmail ?? null,
      },
      createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
      updatedAt: f.updatedAt instanceof Date ? f.updatedAt.toISOString() : String(f.updatedAt),
      likedByMe: likedSet.has(f.id),
    };
  });
}

/** List news feeds using raw SQL (works even if Prisma delegate is missing) */
async function listViaRawSql(schoolId: string, userId: string) {
  const feeds = await prisma.$queryRawUnsafe<FeedRow[]>(
    `SELECT nf.id, nf.title, nf.description, nf.photo, nf.photos, nf.likes, nf."schoolId", nf."createdById",
            nf."createdAt", nf."updatedAt",
            u.id as "creatorId", u.name as "creatorName", u.email as "creatorEmail"
     FROM "NewsFeed" nf
     LEFT JOIN "User" u ON u.id = nf."createdById"
     WHERE nf."schoolId" = $1
     ORDER BY nf."createdAt" DESC`,
    schoolId
  );

  const feedIds = feeds.map((f) => f.id);
  let likedSet = new Set<string>();
  if (feedIds.length > 0) {
    const placeholders = feedIds.map((_, i) => `$${i + 2}`).join(", ");
    const likeRows = await prisma.$queryRawUnsafe<LikeRow[]>(
      `SELECT "newsFeedId" FROM "NewsFeedLike" WHERE "userId" = $1 AND "newsFeedId" IN (${placeholders})`,
      userId,
      ...feedIds
    );
    likedSet = new Set(likeRows.map((r) => r.newsFeedId));
  }

  return mapFeedsToResponse(feeds, likedSet);
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await getSchoolId(session);

    if (!schoolId) {
      return NextResponse.json({ newsFeeds: [] }, { status: 200 });
    }

    const userId = session.user.id;
    const now = Date.now();
    if (now - lastPurgeStartedAt > NEWSFEED_PURGE_INTERVAL_MS) {
      lastPurgeStartedAt = now;
      void purgeExpiredNewsFeeds().catch((error) => {
        console.warn("News feed retention cleanup failed:", error);
      });
    }

    try {
      const feeds = await prisma.newsFeed.findMany({
        where: { schoolId },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true , photoUrl: true},
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const feedIds = feeds.map((f) => f.id);
      const myLikes =
        feedIds.length > 0
          ? await prisma.newsFeedLike.findMany({
              where: { userId, newsFeedId: { in: feedIds } },
              select: { newsFeedId: true },
            })
          : [];
      const likedSet = new Set(myLikes.map((l) => l.newsFeedId));

      const newsFeeds = feeds.map((f) => {
        const fAny = f as { photos?: string[] };
        const photos = Array.isArray(fAny.photos) && fAny.photos.length > 0 ? fAny.photos : f.photo ? [f.photo] : [];
        return {
        id: f.id,
        title: f.title,
        description: f.description,
        photo: f.photo ?? photos[0] ?? null,
        photos,
        mediaUrl: f.photo ?? photos[0] ?? null,
        mediaType: (f.photo || photos.length) ? "PHOTO" : null,
        likes: f.likes ?? 0,
        schoolId: f.schoolId,
        createdById: f.createdById,
        createdBy: f.createdBy
          ? { id: f.createdBy.id, name: f.createdBy.name, email: f.createdBy.email, photoUrl: f.createdBy.photoUrl }
          : { id: f.createdById, name: null, email: null, photoUrl: null },
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        likedByMe: likedSet.has(f.id),
      };
      });

      return NextResponse.json({ newsFeeds }, { status: 200 });
    } catch (prismaErr) {
      console.warn("News feed list via Prisma failed, trying raw SQL:", prismaErr);
      const newsFeeds = await listViaRawSql(schoolId, userId);
      return NextResponse.json({ newsFeeds }, { status: 200 });
    }
  } catch (error: unknown) {
    console.error("List news feeds error:", error);
    const msg =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: string })?.message === "string"
          ? (error as { message: string }).message
          : "Internal server error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
