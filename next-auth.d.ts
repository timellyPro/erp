import NextAuth, { DefaultSession, DefaultUser } from "next-auth";
import { Role } from "@prisma/client";

declare module "next-auth" {
  interface User extends DefaultUser {
    id: string;
    role: Role;
    schoolId?: string | null;
    mobile?: string | null;
    studentId?: string | null;
    allowedFeatures?: string[];
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      schoolId?: string | null;
      mobile?: string | null;
      studentId?: string | null;
      allowedFeatures?: string[];
      schoolIsActive?: boolean; // when false, school is paused (all tabs blocked)
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    schoolId?: string | null;
    mobile?: string | null;
    studentId?: string | null;
    allowedFeatures?: string[];
    schoolIsActive?: boolean;
    image?: string | null;
    /** Superadmin: session cookie only (no persistent login across browser restarts). */
    sessionOnly?: boolean;
    /** internal cache timestamp for DB sync (ms since epoch) */
    _dbSyncAt?: number;
  }
}
