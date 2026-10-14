import prisma from "@/lib/db";
import type { Session } from "next-auth";
import { HttpError } from "@/lib/errors/errorInfo";

export async function getSessionSchoolId(session: Session): Promise<string | null> {
  const direct = session.user.schoolId;
  if (direct && typeof direct === "string") return direct;

  const school = await prisma.school.findFirst({
    where: {
      OR: [
        { admins: { some: { id: session.user.id } } },
        { teachers: { some: { id: session.user.id } } },
      ],
    },
    select: { id: true },
  });

  return school?.id ?? null;
}

export function assertCanManageAdmissions(role: string | undefined | null) {
  const r = String(role ?? "").toUpperCase();
  const ok = r === "TEACHER" || r === "SCHOOLADMIN" || r === "SUPERADMIN";
  if (!ok) {
    throw new HttpError("You do not have permission to manage admissions", 403);
  }
}

