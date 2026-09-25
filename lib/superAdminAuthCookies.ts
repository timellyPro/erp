import { decode, getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_BASES = ["next-auth.session-token", "__Secure-next-auth.session-token"];

function isSessionTokenCookie(name: string): boolean {
  return SESSION_COOKIE_BASES.some((base) => name === base || name.startsWith(`${base}.`));
}

function parseSetCookieHeader(header: string): { name: string; value: string } {
  const [nameValue] = header.split(";");
  const eq = nameValue.indexOf("=");
  return {
    name: nameValue.slice(0, eq).trim(),
    value: nameValue.slice(eq + 1).trim(),
  };
}

function reassembleTokenFromSetCookies(setCookies: string[]): string | null {
  const parts = setCookies
    .map(parseSetCookieHeader)
    .filter((c) => isSessionTokenCookie(c.name) && c.value);

  if (parts.length === 0) return null;

  const single = parts.find((c) => !/\.\d+$/.test(c.name));
  if (single) return single.value;

  return parts
    .sort((a, b) => {
      const aIdx = Number.parseInt(a.name.split(".").pop() ?? "0", 10);
      const bIdx = Number.parseInt(b.name.split(".").pop() ?? "0", 10);
      return aIdx - bIdx;
    })
    .map((c) => c.value)
    .join("");
}

function stripPersistentCookieAttrs(setCookie: string): string {
  return setCookie
    .split(";")
    .filter((part) => {
      const key = part.trim().split("=")[0]?.toLowerCase();
      return key !== "max-age" && key !== "expires";
    })
    .join("; ");
}

async function isSuperAdminSessionOnly(req: NextRequest, setCookies: string[]): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return false;

  const fromRequest = await getToken({ req, secret });
  if (fromRequest?.role === "SUPERADMIN" && fromRequest?.sessionOnly) return true;

  const tokenValue = reassembleTokenFromSetCookies(setCookies);
  if (!tokenValue) return false;

  const decoded = await decode({ token: tokenValue, secret });
  return decoded?.role === "SUPERADMIN" && decoded?.sessionOnly === true;
}

/** Superadmin sessions use browser session cookies (no Max-Age / Expires). */
export async function adaptSuperAdminSessionCookies(
  req: NextRequest,
  res: Response
): Promise<Response> {
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];

  if (setCookies.length === 0) return res;

  const sessionOnly = await isSuperAdminSessionOnly(req, setCookies);
  if (!sessionOnly) return res;

  const headers = new Headers(res.headers);
  headers.delete("set-cookie");

  for (const cookie of setCookies) {
    const { name, value } = parseSetCookieHeader(cookie);
    if (isSessionTokenCookie(name) && value) {
      headers.append("set-cookie", stripPersistentCookieAttrs(cookie));
    } else {
      headers.append("set-cookie", cookie);
    }
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
