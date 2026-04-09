import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { getServerSession } from "next-auth";
import { createNotification } from "@/lib/notificationService";

interface Params {
  id: string;
}

type ApproveType = "FULL" | "CONDITIONAL";

export async function PATCH(
  req: Request,
  { params }: { params: Params | Promise<Params> } // ✅ fix here
) {
  try {
    const { id } = await params; // ✅ fix here

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Leave ID is required" }),
        { status: 400 }
      );
    }

    // 1️⃣ Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      );
    }

    // OPTIONAL: role check
    if (!["SCHOOLADMIN", "ADMIN"].includes(session.user.role)) {
      return new Response(
        JSON.stringify({ error: "Permission denied" }),
        { status: 403 }
      );
    }

    // 2️⃣ Parse body
    const { type, remarks }: { type: ApproveType; remarks?: string } =
      await req.json();

    if (!["FULL", "CONDITIONAL"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid approval type" }),
        { status: 400 }
      );
    }

    if (type === "CONDITIONAL" && !remarks?.trim()) {
      return new Response(
        JSON.stringify({
          error: "Remarks are required for conditional approval"
        }),
        { status: 400 }
      );
    }

    // 3️⃣ Fetch leave request
    const leave = await prisma.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        schoolId: true
      }
    });

    if (!leave) {
      return new Response(
        JSON.stringify({ error: "Leave request not found" }),
        { status: 404 }
      );
    }

    // OPTIONAL: school isolation
    if (leave.schoolId !== session.user.schoolId) {
      return new Response(
        JSON.stringify({ error: "Invalid school access" }),
        { status: 403 }
      );
    }

    if (leave.status !== "PENDING") {
      return new Response(
        JSON.stringify({
          error: `Leave already ${leave.status.toLowerCase()}`
        }),
        { status: 409 }
      );
    }

    // 4️⃣ Update leave
    const updatedLeave = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status:
          type === "CONDITIONAL"
            ? "CONDITIONALLY_APPROVED"
            : "APPROVED",
        remarks: type === "CONDITIONAL" ? remarks!.trim() : null,
        approverId: session.user.id
      }
    });

    createNotification(
      updatedLeave.teacherId,
      "LEAVE",
      "Teacher leave approved",
      type === "CONDITIONAL" && remarks
        ? `Your teacher leave was conditionally approved: ${remarks}`
        : "Your teacher leave request has been approved"
    ).catch(() => {});

    // 5️⃣ Success
    return new Response(JSON.stringify(updatedLeave), {
      status: 200
    });

  } catch (error: any) {
    console.error("Leave approval failed:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Something went wrong"
      }),
      { status: 500 }
    );
  }
}
