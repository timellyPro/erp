import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

/** P2021 = table does not exist (migrations not applied). */
export function extraHeadTemplatesErrorResponse(error: unknown, logLabel: string) {
  console.error(logLabel, error);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
    return NextResponse.json(
      {
        message:
          "Database is missing the fee-head templates table. From the project root run: npx prisma migrate deploy (or prisma migrate dev).",
        code: "P2021",
      },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { message: error instanceof Error ? error.message : "Internal server error" },
    { status: 500 }
  );
}
