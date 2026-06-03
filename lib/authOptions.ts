import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";

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
          console.log("Auth: Missing email or password");
          return null;
        }

        try {
          // NOTE: email is no longer globally unique (tenant-scoped unique),
          // so we cannot use `findUnique({ where: { email } })`.
          // Until the login UI becomes school-aware, we accept the first match and
          // hard-fail if there are duplicates across tenants.
          const candidates = await prisma.user.findMany({
            where: { email: credentials.email },
            take: 2,
            select: { id: true },
          });
          if (candidates.length === 0) {
            console.log("Auth: User not found for email:", credentials.email);
            return null;
          }
          if (candidates.length > 1) {
            throw new Error("Multiple accounts exist for this email. Please contact your administrator.");
          }

          const user = await prisma.user.findUnique({
            where: { id: candidates[0].id },
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
              student: { select: { id: true, schoolId: true } },
              assignedClasses: true,
              school: true,
            },
          });

          if (!user) {
            console.log("Auth: User not found for email:", credentials.email);
            return null;
          }

          // Check if password is explicitly null (deactivated account)
          // Only block login if password is null - allow password verification for all other cases
          if (user.password === null) {
            console.log("Auth: User account is deactivated (password is null) for email:", credentials.email);
            throw new Error("Account is deactivated or password not set. Please contact your administrator.");
          }

          // If password is undefined or empty string, treat as invalid credentials
          if (user.password === undefined || user.password === "") {
            console.log("Auth: User has no valid password for email:", credentials.email);
            return null;
          }

          // Verify the password - this will work even if password is a valid hash
          try {
            const isValid = await bcrypt.compare(
              credentials.password,
              user.password
            );

            if (!isValid) {
              console.log("Auth: Password mismatch for user:", credentials.email);
              return null;
            }
          } catch (bcryptError) {
            // If bcrypt.compare fails (e.g., invalid hash format), treat as invalid password
            console.log("Auth: Password verification failed for user:", credentials.email, bcryptError);
            return null;
          }

          console.log("Auth: Successfully authenticated user:", user.email, "Role:", user.role);

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
          console.error("Auth error:", err);
          if (err?.code === "P2022") {
            console.error("Auth: DB schema may be out of sync. Run: npx prisma db push");
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
      (token as any)._dbSyncAt = Date.now();
    }

    // Keep schoolId/allowedFeatures/image in sync, but NOT on every request.
    // The jwt callback runs very frequently (every getServerSession / /api/auth/session),
    // so doing a DB query each time will exhaust small connection pools in production.
    // Do NOT treat missing profile image as "must sync" — many users have no photoUrl,
    // and that would run prisma.user.findUnique on EVERY request (JWT runs per getServerSession).
    const shouldSyncFromDb = (() => {
      if (!token.id) return false;
      const now = Date.now();
      const last = typeof (token as any)._dbSyncAt === "number" ? (token as any)._dbSyncAt : 0;
      const stale = now - last > 5 * 60 * 1000; // 5 minutes
      const missingCritical =
        token.schoolId == null ||
        token.allowedFeatures == null;
      return stale || missingCritical;
    })();

    if (shouldSyncFromDb && token.id) {
      const dbUser = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: {
          schoolId: true,
          allowedFeatures: true,
          photoUrl: true,
          student: { select: { schoolId: true } },
          adminSchools: { select: { id: true } },
          teacherSchools: { select: { id: true } },
        },
      });
      if (dbUser) {
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
        (token as any)._dbSyncAt = Date.now();
      }
    }

    return token;
  },

  async session({ session, token }) {
    session.user = {
      ...session.user,
      id: token.id as string,
      role: token.role as "SUPERADMIN" | "SCHOOLADMIN" | "TEACHER" | "STUDENT",
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
