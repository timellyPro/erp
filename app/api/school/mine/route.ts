import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

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

  return NextResponse.json({ school }, { status: 200 });
}
