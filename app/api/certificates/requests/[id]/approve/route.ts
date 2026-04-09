import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notificationService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    let documentUrl: string | undefined;
    
    // Check if request contains FormData (file upload) or JSON
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const documentUrlInput = formData.get("documentUrl") as string | null;
        
        // If file is provided, upload it
        if (file && file instanceof File) {
          // Upload file to Supabase
          const { supabaseAdmin, SUPABASE_BUCKET } = await import("@/lib/supabase");
          
          if (supabaseAdmin) {
            const ext = file.name.split(".").pop() || "pdf";
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80);
            const path = `certificates/${Date.now()}-${safeName}`;
            
            const buffer = Buffer.from(await file.arrayBuffer());
            
            const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
              .from(SUPABASE_BUCKET)
              .upload(path, buffer, {
                contentType: file.type,
                upsert: false,
              });
            
            if (uploadError) {
              console.error("File upload error:", uploadError);
              return NextResponse.json(
                { message: uploadError.message || "File upload failed" },
                { status: 500 }
              );
            }
            
            const { data: urlData } = supabaseAdmin.storage
              .from(SUPABASE_BUCKET)
              .getPublicUrl(uploadData.path);
            
            documentUrl = urlData.publicUrl;
          } else {
            return NextResponse.json(
              { message: "File upload not configured" },
              { status: 503 }
            );
          }
        } else if (documentUrlInput) {
          documentUrl = documentUrlInput;
        }
      } catch (formError) {
        console.error("FormData parsing error:", formError);
        // Continue without document if FormData parsing fails
      }
    } else {
      // Handle JSON body
      try {
        const body = await req.json();
        documentUrl = body?.documentUrl || body?.tcDocumentUrl;
      } catch {
        // empty or invalid body
      }
    }

    let schoolId = session.user.schoolId;
    if (!schoolId) {
      const adminSchool = await prisma.school.findFirst({
        where: { admins: { some: { id: session.user.id } } },
        select: { id: true },
      });
      schoolId = adminSchool?.id ?? null;
    }
    if (!schoolId) {
      return NextResponse.json(
        { message: "School not found in session" },
        { status: 400 }
      );
    }

    // Verify certificate request belongs to school
    const certificateRequest = await prisma.transferCertificate.findFirst({
      where: {
        id: id,
        schoolId: schoolId,
      },
      include: {
        student: true,
      },
    });

    if (!certificateRequest) {
      return NextResponse.json(
        { message: "Certificate request not found or doesn't belong to your school" },
        { status: 404 }
      );
    }

    if (certificateRequest.status !== "PENDING") {
      return NextResponse.json(
        { message: `Certificate request is already ${certificateRequest.status}` },
        { status: 400 }
      );
    }

    // Check if this is a Transfer Certificate
    // certificateType field may not exist in schema yet, so we check safely
    const certificateType = (certificateRequest as any).certificateType;
    const isTransferCertificate = certificateType === "TRANSFER" || certificateType === null || certificateType === undefined;

    // Use transaction to approve certificate request
    const result = await prisma.$transaction(async (tx) => {
      // Update certificate request status
      const updatedRequest = await tx.transferCertificate.update({
        where: { id: id },
        data: {
          status: "APPROVED",
          approvedById: session.user.id,
          issuedDate: new Date(),
          tcDocumentUrl: documentUrl || null,
        },
      });

      // Only perform TC-specific actions (remove from class, save to history) for Transfer Certificates
      if (isTransferCertificate) {
        // Save student data to history
        const studentData = {
          id: certificateRequest.student.id,
          userId: certificateRequest.student.userId,
          schoolId: certificateRequest.student.schoolId,
          classId: certificateRequest.student.classId,
          fatherName: certificateRequest.student.fatherName,
          aadhaarNo: certificateRequest.student.aadhaarNo,
          phoneNo: certificateRequest.student.phoneNo,
          rollNo: certificateRequest.student.rollNo,
          dob: certificateRequest.student.dob,
          address: certificateRequest.student.address,
          createdAt: certificateRequest.student.createdAt,
        };

        await tx.studentHistory.upsert({
          where: { originalStudentId: certificateRequest.student.id },
          create: {
            originalStudentId: certificateRequest.student.id,
            schoolId: schoolId,
            studentData: studentData as any,
            deactivatedBy: session.user.id,
            reason: `Transfer Certificate approved - ${certificateRequest.reason || "No reason provided"}`,
          },
          update: {
            studentData: studentData as any,
            deactivatedBy: session.user.id,
            reason: `Transfer Certificate approved - ${certificateRequest.reason || "No reason provided"}`,
          },
        });

        // Remove student from class (only for Transfer Certificates)
        await tx.student.update({
          where: { id: certificateRequest.student.id },
          data: {
            classId: null,
          },
        });
      }

      // Note: We never deactivate the account by setting password to null
      // The account remains active for all certificate types
      // For Transfer Certificates, the student is removed from class but account stays active

      return updatedRequest;
    });

    const successMessage = isTransferCertificate
      ? "Transfer Certificate approved successfully. Student removed from class."
      : "Certificate request approved successfully.";

    const studentUserId = certificateRequest.student?.userId;
    if (studentUserId) {
      await createNotification(
        studentUserId,
        "CERTIFICATES",
        "Certificate Approved",
        isTransferCertificate
          ? "Your Transfer Certificate request has been approved."
          : "Your certificate request has been approved."
      );
    }

    return NextResponse.json(
      {
        message: successMessage,
        certificateRequest: result,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Approve certificate request error:", error);
    return NextResponse.json(
      { message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
