import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { swrGet, swrSet } from "@/lib/tenantCache";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { message: "Unauthorized", school: null },
      { status: 401 }
    );
  }

  const schoolId = session.user.schoolId;

  if (!schoolId) {
    return NextResponse.json({ school: null }, { status: 200 });
  }

  if (session.user.schoolIsActive === false) {
    return NextResponse.json(
      { message: "School is paused", school: null },
      { status: 403 }
    );
  }

  const cacheKey = `cache:user:${session.user.id}:school:mine:${schoolId}`;
  const now = Date.now();
  const cached = await swrGet<{ school: unknown }>(cacheKey);
  if (cached && now < cached.freshUntil) {
    return NextResponse.json({ school: cached.value.school }, { status: 200 });
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      admins: {
        where: { role: "SCHOOLADMIN", photoUrl: { not: null } },
        select: { photoUrl: true },
        take: 1,
      }
    }
  });

  await swrSet(
    cacheKey,
    { value: { school }, freshUntil: now + 15_000, staleUntil: now + 60_000 },
    60
  );
  return NextResponse.json({ school }, { status: 200 });
}
