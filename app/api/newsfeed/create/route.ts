import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
import { tenantDb as prisma, runInTenantScope } from "@/lib/db/tenantContext";
import { randomBytes } from "crypto";
import {
  createNotificationsForUserIds,
  getSchoolUserIds,
} from "@/lib/notificationService";
import { logger } from "@/lib/logger";
import { toClientErrorMessage } from "@/lib/errors/errorInfo";

function generateId(): string {
  const prefix = "c";
  const timestamp = Date.now().toString(36);
  const random = randomBytes(5).toString("hex");
  return `${prefix}${timestamp}${random}`;
}

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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schoolId = await getSchoolId(session);

    const parsedBody = z.record(z.string(), z.unknown()).safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;
    const title =
      typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const photosRaw = Array.isArray(body.photos) ? body.photos : [];
    const photos = photosRaw.filter((p: unknown): p is string => typeof p === "string" && !!p);
    const photo =
      photos[0] ??
      (typeof body.photo === "string" && body.photo ? body.photo : null) ??
      (typeof body.mediaUrl === "string" && body.mediaUrl ? body.mediaUrl : null);

    if (!title || !description) {
      return NextResponse.json(
        { message: "Title and description are required" },
        { status: 400 }
      );
    }

    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found. Only school users can create posts." },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const createdBy = {
      id: session.user.id,
      name: session.user.name ?? null,
      email: session.user.email ?? null,
    };

    try {
      const newsFeed = await runInTenantScope(schoolId, () => prisma.newsFeed.create({
        data: {
          title,
          description,
          photo: photo || null,
          photos: photos.length > 0 ? photos : [],
          likes: 0,
          schoolId,
          createdById: userId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }));

      try {
        const userIds = await getSchoolUserIds(schoolId);
        await createNotificationsForUserIds(
          userIds.filter((id) => id !== userId),
          "NEWS",
          "New post",
          title.length > 60 ? title.slice(0, 60) + "…" : title
        );
      } catch (nErr) {
        logger.warn("News notification creation failed:", nErr);
      }

      return NextResponse.json(
        {
          message: "News feed created successfully",
          newsFeed: {
            id: newsFeed.id,
            title: newsFeed.title,
            description: newsFeed.description,
            photo: newsFeed.photo,
            photos: (newsFeed as { photos?: string[] }).photos ?? photos,
            likes: newsFeed.likes,
            createdBy: newsFeed.createdBy ?? createdBy,
            createdAt: newsFeed.createdAt.toISOString(),
            updatedAt: newsFeed.updatedAt.toISOString(),
            likedByMe: false,
          },
        },
        { status: 201 }
      );
    } catch (prismaErr) {
      logger.warn("News feed create via Prisma failed, trying raw SQL:", prismaErr);
    }

    const id = generateId();
    const now = new Date();
    const isoNow = now.toISOString();

    const photosArr = photos.length > 0 ? photos : (photo ? [photo] : []);
    await runInTenantScope(schoolId, () => prisma.$executeRawUnsafe(
      `INSERT INTO "NewsFeed" (id, title, description, photo, photos, likes, "schoolId", "createdById", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $9::text[], 0, $5, $6, $7::timestamptz, $8::timestamptz)`,
      id,
      title,
      description,
      photo ?? null,
      schoolId,
      userId,
      isoNow,
      isoNow,
      photosArr
    ));

    try {
      const userIds = await getSchoolUserIds(schoolId);
      await createNotificationsForUserIds(
        userIds.filter((id) => id !== userId),
        "NEWS",
        "New post",
        title.length > 60 ? title.slice(0, 60) + "…" : title
      );
    } catch (nErr) {
      logger.warn("News notification creation failed (raw insert path):", nErr);
    }

    return NextResponse.json(
      {
        message: "News feed created successfully",
        newsFeed: {
          id,
          title,
          description,
          photo,
          photos,
          likes: 0,
          createdBy,
          createdAt: isoNow,
          updatedAt: isoNow,
          likedByMe: false,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    logger.error("Create news feed error:", error);
    const msg = toClientErrorMessage(error, "Internal server error");
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
