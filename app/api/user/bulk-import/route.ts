import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/authOptions";
import prisma from "../../../../lib/db";
import bcrypt from "bcryptjs";

const VALID_ROLES = ["SUPERADMIN", "SCHOOLADMIN", "TEACHER", "STUDENT"];

// Simple CSV parser
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    rows.push(row);
  }

  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Check if user has permission to create users
    if (!["SCHOOLADMIN", "SUPERADMIN"].includes(session.user.role)) {
      return NextResponse.json(
        { message: "You do not have permission to import users" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { message: "No file provided" },
        { status: 400 }
      );
    }

    const fileContent = await file.text();
    const rows = parseCSV(fileContent);

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "No data found in file" },
        { status: 400 }
      );
    }

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because of header and 1-based indexing

      try {
        const { name, email, role, designation, password } = row;

        // Validation
        if (!name || !email || !role || !password) {
          errors.push(
            `Row ${rowNum}: Missing required fields (name, email, role, password)`
          );
          failed++;
          continue;
        }

        // Validate role
        if (!VALID_ROLES.includes(role.toUpperCase())) {
          errors.push(
            `Row ${rowNum}: Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`
          );
          failed++;
          continue;
        }

        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push(`Row ${rowNum}: Invalid email format`);
          failed++;
          continue;
        }

        // Check if email already exists
        const bulkSchoolId = session.user.schoolId as string;
        const existingUser = await prisma.user.findUnique({
          where: { schoolId_email: { schoolId: bulkSchoolId, email } },
        });

        if (existingUser) {
          errors.push(`Row ${rowNum}: Email already exists`);
          failed++;
          continue;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        await prisma.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: role.toUpperCase() as any,
            schoolId: session.user.schoolId,
            ...(designation && { subject: designation }),
            allowedFeatures: [],
          },
        });

        successful++;
      } catch (error: any) {
        errors.push(
          `Row ${rowNum}: ${error.message || "Unknown error"}`
        );
        failed++;
      }
    }

    return NextResponse.json({
      successful,
      failed,
      total: rows.length,
      errors: errors.slice(0, 20), // Return first 20 errors
    });
  } catch (error: any) {
    console.error("Bulk import error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
