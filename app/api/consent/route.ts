import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions";
// Owner connection on purpose: reads/writes only the caller's own User row (id from the
// session, never from the request), so there is no tenant context to scope by.
// Listed in lib/db/ownerConnectionRoutes.json.
import prisma from "@/lib/db";
import { PRIVACY_POLICY_VERSION } from "@/lib/consent";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** GET /api/consent - has the signed-in user accepted the current privacy policy? */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { privacyConsentVersion: true, privacyConsentAt: true },
    });
    return NextResponse.json({
      required: PRIVACY_POLICY_VERSION,
      accepted: user?.privacyConsentVersion === PRIVACY_POLICY_VERSION,
      acceptedVersion: user?.privacyConsentVersion ?? null,
      acceptedAt: user?.privacyConsentAt ?? null,
    });
  } catch (error) {
    logger.error("[consent] read failed", error);
    return NextResponse.json({ message: "Failed to load consent" }, { status: 500 });
  }
}

/** POST /api/consent - record acceptance of the current policy version. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const acceptedAt = new Date();
    await prisma.user.update({
      where: { id: session.user.id },
      data: { privacyConsentVersion: PRIVACY_POLICY_VERSION, privacyConsentAt: acceptedAt },
    });
    return NextResponse.json({ accepted: true, version: PRIVACY_POLICY_VERSION, acceptedAt });
  } catch (error) {
    logger.error("[consent] write failed", error);
    return NextResponse.json({ message: "Failed to record consent" }, { status: 500 });
  }
}
