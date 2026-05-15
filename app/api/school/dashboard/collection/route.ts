import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { buildSchoolDashboardCollection } from "@/lib/buildSchoolDashboardCollection";
import { resolveSchoolAdminSchoolId } from "@/lib/resolveSchoolAdminSchoolId";

/** Fast day collection only — used when calendar date changes (no full dashboard reload). */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "SCHOOLADMIN" || session.user.role === "SUPERADMIN";
  if (!isAdmin) {
    return NextResponse.json({ message: "Only admins can view school dashboard" }, { status: 403 });
  }

  try {
    const ctx = await resolveSchoolAdminSchoolId(session);
    if ("error" in ctx) {
      return NextResponse.json({ message: ctx.error }, { status: ctx.status });
    }

    const date = new URL(request.url).searchParams.get("date")?.trim() || undefined;
    const payload = await buildSchoolDashboardCollection(ctx.schoolId, date);
    return NextResponse.json(payload, { status: 200 });
  } catch (error: unknown) {
    console.error("Dashboard collection error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
