import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/db";

const profileCache = new Map<string, { expiresAt: number; user: unknown }>();
const PROFILE_CACHE_TTL_MS = 60_000;

export function invalidateChairmanProfileCache(userId?: string | null): void {
  if (!userId) {
    profileCache.clear();
    return;
  }
  profileCache.delete(userId);
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req });
  if (!token?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const role = String(token.role ?? "");
  if (role !== "CHAIRMAN" && role !== "SUPERADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const userId = String(token.id);
  const cached = profileCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({ user: cached.user });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      mobile: true,
      address: true,
      language: true,
      photoUrl: true,
      role: true,
    },
  });

  profileCache.set(userId, { user, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
  return NextResponse.json({ user });
}
