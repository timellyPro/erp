import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { NotificationType } from "@prisma/client";
import { apiMemGetSwr, apiMemSet } from "@/lib/apiMemoryCache";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") as NotificationType | null;
    const onlyUnread = searchParams.get("onlyUnread") === "true";
    const take = Math.min(100, Number(searchParams.get("take") || 20));

    const memKey = `notifications:${userId}:${type ?? "ALL"}:${onlyUnread ? "1" : "0"}:${take}`;
    const cached = apiMemGetSwr<{ notifications: unknown[]; unreadCount: number }>(memKey);
    if (cached) {
      return NextResponse.json(cached.value, {
        status: 200,
        headers: { "Cache-Control": "private, no-store, must-revalidate" },
      });
    }

    const where: {
      userId: string;
      type?: NotificationType;
      isRead?: boolean;
    } = { userId };

    if (type) where.type = type;
    if (onlyUnread) where.isRead = false;

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const payload = { notifications, unreadCount };
    apiMemSet(memKey, payload, 25_000, 120_000);

    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "private, no-store, must-revalidate" },
    });
  } catch (e: unknown) {
    console.error("Notifications GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// Optional: system/admin code can call this to create notifications
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const userId = typeof body.userId === "string" ? body.userId : session.user.id;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const type = body.type as NotificationType | undefined;

    if (!title || !message || !type) {
      return NextResponse.json(
        { message: "userId, title, message and type are required" },
        { status: 400 }
      );
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
      },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (e: unknown) {
    console.error("Notifications POST:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
