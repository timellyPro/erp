import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/db";
import { isActiveStudent } from "@/lib/students/studentStatus";
import bcrypt from "bcryptjs";
import { logger } from "@/lib/logger";
import { rateLimit, rateLimitKey } from "@/lib/rateLimit";

// Brute-force protection on the credentials login: 10 attempts per email per 5
// minutes. Keyed by email (not IP — authorize() doesn't receive the request),
// which still bounds password-guessing against a single account. See
// PRODUCTION_READINESS.md's "No rate limiting" finding.
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;

// Hard ceiling on how long a session can keep running on a cached JWT while the
// periodic DB re-sync keeps failing (see the jwt callback below). Bounds the
// fail-open tradeoff: a brief DB blip shouldn't 401 every request, but an
// extended outage shouldn't let stale role/schoolId/allowedFeatures data be
// trusted forever either.
const MAX_STALE_SESSION_MS = 60 * 60 * 1000; // 60 minutes

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma as unknown as PrismaClient),

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          logger.info("Auth: Missing email or password");
          return null;
        }

        const loginKey = rateLimitKey("login", credentials.email);
        const limitResult = await rateLimit(
          loginKey,
          LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
          LOGIN_RATE_LIMIT_WINDOW_SECONDS
        );
        if (!limitResult.allowed) {
          logger.info("Auth: Rate limit exceeded for email:", credentials.email);
          throw new Error(
            `Too many login attempts. Please try again in ${Math.ceil(limitResult.resetInSeconds / 60)} minute(s).`
          );
        }

        try {
          // NOTE: email is no longer globally unique (tenant-scoped unique),
          // so we cannot use `findUnique({ where: { email } })`.
          // Until the login UI becomes school-aware, we accept the first match and
          // hard-fail if there are duplicates across tenants.
          // Single query (take: 2) — avoids a second round-trip when the pool is slow.
          const matches = await prisma.user.findMany({
            where: { email: credentials.email },
            take: 2,
            select: {
              id: true,
              name: true,
              email: true,
              password: true,
              role: true,
              schoolId: true,
              mobile: true,
              photoUrl: true,
              allowedFeatures: true,
              student: { select: { id: true, schoolId: true, status: true } },
              assignedClasses: true,
              school: true,
            },
          });
          if (matches.length === 0) {
            logger.info("Auth: User not found for email:", credentials.email);
            return null;
          }
          if (matches.length > 1) {
            throw new Error("Multiple accounts exist for this email. Please contact your administrator.");
          }

          const user = matches[0];

          // Check if password is explicitly null (deactivated account)
          // Only block login if password is null - allow password verification for all other cases
          if (user.password === null) {
            logger.info("Auth: User account is deactivated (password is null) for email:", credentials.email);
            throw new Error("Account is deactivated or password not set. Please contact your administrator.");
          }

          // If password is undefined or empty string, treat as invalid credentials
          if (user.password === undefined || user.password === "") {
            logger.info("Auth: User has no valid password for email:", credentials.email);
            return null;
          }

          // Verify the password - this will work even if password is a valid hash
          try {
            const isValid = await bcrypt.compare(
              credentials.password,
              user.password
            );

            if (!isValid) {
              logger.info("Auth: Password mismatch for user:", credentials.email);
              return null;
            }
          } catch (bcryptError) {
            // If bcrypt.compare fails (e.g., invalid hash format), treat as invalid password
            logger.info("Auth: Password verification failed for user:", credentials.email, bcryptError);
            return null;
          }

          if (user.student && !isActiveStudent(user.student.status)) {
            logger.info("Auth: Student account is inactive for email:", credentials.email);
            throw new Error("Account is deactivated or password not set. Please contact your administrator.");
          }

          logger.info("Auth: Successfully authenticated user:", user.email, "Role:", user.role);

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.photoUrl ?? null,
            role: user.role,
            schoolId: user.schoolId,
            mobile: user.mobile,
            studentId: user.student?.id ?? null,
            allowedFeatures: user.allowedFeatures ?? [],
          };
        } catch (error: unknown) {
          const err = error as { code?: string; message?: string };
          logger.error("Auth error:", err);
          if (err?.code === "P2022") {
            logger.error("Auth: DB schema may be out of sync. Run: npx prisma db push");
          }
          // If it's a custom error message, throw it so it can be displayed to user
          if (err?.message && err.message.includes("Account is deactivated")) {
            throw err;
          }
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
  async jwt({ token, user }) {
    // First login
    if (user) {
      token.id = user.id;
      token.role = user.role;
      token.schoolId = user.schoolId;
      token.mobile = user.mobile;
      token.studentId = user.studentId;
      token.allowedFeatures = user.allowedFeatures ?? [];
      token.image = (user as { image?: string | null }).image ?? null;
      if (user.role === "SUPERADMIN") {
        token.sessionOnly = true;
      }
      token._dbSyncAt = Date.now();
      token._lastSuccessfulSyncAt = Date.now();
    }

    // Keep schoolId/allowedFeatures/image in sync, but NOT on every request.
    // The jwt callback runs very frequently (every getServerSession / /api/auth/session),
    // so doing a DB query each time will exhaust small connection pools in production.
    // Do NOT treat missing profile image as "must sync" — many users have no photoUrl,
    // and that would run prisma.user.findUnique on EVERY request (JWT runs per getServerSession).
    const shouldSyncFromDb = (() => {
      if (!token.id) return false;
      const now = Date.now();
      const last = typeof token._dbSyncAt === "number" ? token._dbSyncAt : 0;
      const stale = now - last > 5 * 60 * 1000; // 5 minutes
      const missingCritical =
        token.schoolId == null ||
        token.allowedFeatures == null;
      return stale || missingCritical;
    })();

    if (shouldSyncFromDb && token.id) {
      // A transient DB hiccup (pool timeout, connection reset) must not throw here:
      // this callback runs on every getServerSession call, so an uncaught error turns
      // into a JWT_SESSION_ERROR and 401s every route on the request, not just this sync.
      // Falling back to the existing token lets the app keep working on stale data
      // until the DB is reachable again; _dbSyncAt is left untouched so it retries soon.
      //
      // That fallback is time-boxed: if the DB has been unreachable long enough that
      // we haven't completed a *successful* sync in MAX_STALE_SESSION_MS, we stop
      // trusting the cached token and force re-authentication instead of running
      // indefinitely on stale role/schoolId/allowedFeatures data.
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            role: true,
            password: true,
            schoolId: true,
            allowedFeatures: true,
            photoUrl: true,
            student: { select: { schoolId: true } },
            adminSchools: { select: { id: true } },
            teacherSchools: { select: { id: true } },
          },
        });
        if (dbUser) {
          // Deactivation (password set to null) must invalidate the session immediately,
          // not just at next login — otherwise a deactivated user keeps full access for
          // the rest of their token's lifetime.
          if (dbUser.password === null) {
            throw new Error("account_deactivated");
          }

          // role is only ever set at first login (see the `if (user)` branch above); a
          // role change/downgrade in the DB must take effect on the next successful sync,
          // not wait for the user's session to expire.
          token.role = dbUser.role;

          if (!token.schoolId) {
            token.schoolId =
              dbUser.schoolId ??
              dbUser.student?.schoolId ??
              dbUser.adminSchools?.[0]?.id ??
              dbUser.teacherSchools?.[0]?.id ??
              null;
          }
          if (dbUser.allowedFeatures?.length !== undefined) {
            token.allowedFeatures = dbUser.allowedFeatures;
          }
          token.image = dbUser.photoUrl ?? token.image ?? null;
          token.schoolIsActive = true;
          token._dbSyncAt = Date.now();
          token._lastSuccessfulSyncAt = Date.now();
        }
      } catch (error) {
        if (error instanceof Error && error.message === "account_deactivated") {
          throw error;
        }

        const lastSuccess =
          typeof token._lastSuccessfulSyncAt === "number" ? token._lastSuccessfulSyncAt : 0;
        const staleSinceLastSuccess = Date.now() - lastSuccess;
        if (staleSinceLastSuccess > MAX_STALE_SESSION_MS) {
          console.error(
            "jwt_db_sync_stale_ceiling_exceeded",
            `staleMs=${staleSinceLastSuccess}`
          );
          throw new Error("session_stale_ceiling_exceeded");
        }

        console.error("jwt_db_sync_failed", error instanceof Error ? error.message : error);
      }
    }

    return token;
  },

  async session({ session, token }) {
    session.user = {
      ...session.user,
      id: token.id as string,
      role: token.role as "SUPERADMIN" | "SCHOOLADMIN" | "CHAIRMAN" | "TEACHER" | "STUDENT",
      schoolId: token.schoolId as string | null,
      mobile: token.mobile as string | null,
      studentId: token.studentId as string | null,
      allowedFeatures: (token.allowedFeatures as string[]) ?? [],
      schoolIsActive: token.schoolIsActive as boolean | undefined,
      image: (token as { image?: string | null }).image ?? session.user?.image ?? null,
    };

    return session;
  },
},

  pages: {
    signIn: "/admin/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
