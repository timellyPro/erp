import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/authOptions";
import { adaptSuperAdminSessionCookies } from "@/lib/superAdminAuthCookies";

const handler = NextAuth(authOptions);

async function withSuperAdminSessionCookies(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const res = await handler(req, context);
  return adaptSuperAdminSessionCookies(req, res);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  return withSuperAdminSessionCookies(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  return withSuperAdminSessionCookies(req, context);
}
