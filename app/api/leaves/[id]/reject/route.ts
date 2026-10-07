import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { createNotification } from "@/lib/notificationService";

interface Params {
  id: string;
}

export async function PATCH(req: Request, { params }: { params: Params | Promise<Params> }) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!id) {
      return new Response(JSON.stringify({ error: "Leave ID is required" }), { status: 400 });
    }

    const existing = await prisma.leaveRequest.findUnique({
      where: { id },
      select: { id: true, schoolId: true, status: true },
    });
    if (!existing) {
      return new Response(JSON.stringify({ error: "Leave request not found" }), { status: 404 });
    }
    if (existing.status !== "PENDING") {
      return new Response(JSON.stringify({ error: "Leave already processed" }), { status: 409 });
    }
    if (existing.schoolId !== session.user.schoolId) {
      return new Response(JSON.stringify({ error: "Invalid school access" }), { status: 403 });
    }
    if (session.user.role !== "SCHOOLADMIN" && session.user.role !== "SUPERADMIN") {
      return new Response(JSON.stringify({ error: "Only school admin can reject teacher leave" }), { status: 403 });
    }

    const leave = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approverId: session.user.id
      }
    });

    createNotification(
      leave.teacherId,
      "LEAVE",
      "Teacher leave rejected",
      "Your teacher leave request was rejected"
    ).catch(() => {});

    return new Response(JSON.stringify(leave), { status: 200 });

  } catch (err: any) {
    console.error("Approve leave failed:", err);
    return new Response(JSON.stringify({ error: err.message || "Unable to approve leave" }), { status: 500 });
  }
}
