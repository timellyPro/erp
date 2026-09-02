import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        address: true,
        qualification: true,
        experience: true,
        language: true,
        photoUrl: true,
        teacherId: true,
        subject: true,
        subjects: true,
        createdAt: true,
        assignedClasses: {
          select: {
            id: true,
            name: true,
            section: true,
            _count: {
              select: {
                students: true,
              },
            },
          },
        },
        role: true,
      },
    });

    return NextResponse.json({ user }, { status: 200 });
  } catch (e: unknown) {
    console.error("User me GET:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const data: {
      mobile?: string | null;
      address?: string | null;
      qualification?: string | null;
      experience?: string | null;
      language?: string | null;
      photoUrl?: string | null;
      name?: string | null;
      teacherId?: string | null;
      subject?: string | null;
    } = {};
    // Email is constant and not updated from settings.

    if (typeof body.mobile === "string" || body.mobile === null) {
      data.mobile = body.mobile && body.mobile.trim() ? body.mobile.trim() : null;
    }
    if (typeof body.address === "string" || body.address === null) {
      data.address = body.address && body.address.trim() ? body.address.trim() : null;
    }
    if (typeof body.qualification === "string" || body.qualification === null) {
      data.qualification =
        body.qualification && body.qualification.trim() ? body.qualification.trim() : null;
    }
    if (typeof body.experience === "string" || body.experience === null) {
      data.experience =
        body.experience && body.experience.trim() ? body.experience.trim() : null;
    }
    if (typeof body.language === "string" || body.language === null) {
      data.language = body.language;
    }
    if (typeof body.photoUrl === "string" || body.photoUrl === null) {
      data.photoUrl = body.photoUrl;
    }
    if (typeof body.name === "string" || body.name === null) {
      data.name = body.name;
    }
    if (typeof body.teacherId === "string" || body.teacherId === null) {
      data.teacherId = body.teacherId;
    }
    if (typeof body.subject === "string" || body.subject === null) {
      data.subject = body.subject;
    }

    const user = await prisma.user.update({
        where: { id: session.user.id },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
          address: true,
          qualification: true,
          experience: true,
          language: true,
          photoUrl: true,
          teacherId: true,
          subject: true,
          subjects: true,
          createdAt: true,
          assignedClasses: {
            select: {
              id: true,
              name: true,
              section: true,
              _count: {
                select: {
                  students: true,
                },
              },
            },
          },
          role: true,
        },
      });

    return NextResponse.json({ user }, { status: 200 });
  } catch (e: unknown) {
    console.error("User me PUT:", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}

