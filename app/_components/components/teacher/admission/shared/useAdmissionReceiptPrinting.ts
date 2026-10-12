import { useEffect, useRef, useState } from "react";
import type { AdmissionReceiptData } from "../../../pdf/AdmissionReceiptTemplate";
import { displayResidencyType } from "./utils";
import type { AdmissionRow, FeeType } from "./types";

export function useAdmissionReceiptPrinting() {
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<AdmissionReceiptData | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch School Info
    fetch("/api/school/mine", { credentials: "include", cache: "no-store" })
      .then((res) => res.json())
      .then(async (d) => {
        setSchoolName(typeof d?.school?.name === "string" ? d.school.name : "");
        const address = [d?.school?.address, d?.school?.location].filter((v: unknown) => typeof v === "string" && v.trim()).join(", ");
        setSchoolAddress(address);

        let parsedLogo = null;
        let rawLogoInfo = d?.school?.logoUrl;

        // Fallback 1: School Admin array returned by the API
        if (!rawLogoInfo && d?.school?.admins && d.school.admins.length > 0) {
          rawLogoInfo = d.school.admins[0].photoUrl;
        }

        // Fallback 2: Check active user's profile explicitly
        if (!rawLogoInfo) {
          try {
            const userRes = await fetch("/api/user/me", { credentials: "include", cache: "no-store" });
            const userData = await userRes.json();
            if (userData?.user?.photoUrl) {
              rawLogoInfo = userData.user.photoUrl;
            }
          } catch {}
        }

        if (typeof rawLogoInfo === "string" && rawLogoInfo.trim()) {
          parsedLogo = rawLogoInfo.trim();

          // Use Nextjs media proxy for Supabase urls to avoid iframe CORS/Auth issues
          if (parsedLogo.includes("/storage/v1/object/")) {
            parsedLogo = `/api/media?url=${encodeURIComponent(parsedLogo)}`;
          }

          if (parsedLogo.startsWith("/")) {
            parsedLogo = window.location.origin + parsedLogo;
          }

          // Pre-fetch and convert logo to Base64 to guarantee it renders seamlessly inside the printing iframe
          try {
            const imgRes = await fetch(parsedLogo);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              const reader = new FileReader();
              reader.onloadend = () => {
                setSchoolLogo(reader.result as string);
              };
              reader.readAsDataURL(blob);
              return; // Exit early since FileReader sets state asynchronously
            }
          } catch (err) {
            console.error("Failed to convert logo to base64", err);
          }
        }

        // If absolutely no logo exists anywhere, dynamically generate one using the UI-Avatars API and the School Name
        if (!parsedLogo) {
          const fallbackName = typeof d?.school?.name === "string" ? d.school.name : "School";
          parsedLogo = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&size=128&background=4ade80&color=fff`;
          // Pre-fetch the generic avatar to Base64 to bypass any strict PDF frame blockers
          try {
            const fallbackRes = await fetch(parsedLogo);
            if (fallbackRes.ok) {
              const blob = await fallbackRes.blob();
              const reader = new FileReader();
              reader.onloadend = () => {
                setSchoolLogo(reader.result as string);
              };
              reader.readAsDataURL(blob);
              return;
            }
          } catch {}
        }

        setSchoolLogo(parsedLogo);
      })
      .catch(() => {
        setSchoolName("");
        setSchoolAddress("");
        setSchoolLogo(null);
      });
  }, []);

  const printFeeReceipt = async (r: AdmissionRow, feeType: FeeType) => {
    const app = feeType === "APPLICATION" ? Number(r.applicationFee ?? 0) : 0;
    const adm = feeType === "ADMISSION" ? Number(r.admissionFee ?? 0) : 0;
    const paidAt =
      feeType === "APPLICATION" ? r.applicationFeePaidAt : r.admissionFeePaidAt;
    const data: AdmissionReceiptData = {
      schoolName: schoolName || "School",
      schoolLogo,
      schoolAddress: schoolAddress || "-",
      applicationNo: r.applicationNo || "-",
      admissionNo: r.admissionNo || null,
      studentName: `${r.firstName} ${r.lastName}`.trim() || "Student",
      className: r.class ? `${r.class.name}${r.class.section ? `-${r.class.section}` : ""}` : r.gradeSought,
      gradeSought: r.gradeSought,
      boardingType: r.boardingType,
      residencyType: displayResidencyType(r.residencyType),
      parentName: r.parentName || "-",
      parentPhone: r.parentPhone || "-",
      createdAt: paidAt ? new Date(paidAt).toLocaleString() : new Date(r.createdAt).toLocaleString(),
      applicationFee: app,
      admissionFee: adm,
      total: app + adm,
      receiptType: feeType,
    };

    setReceiptData(data);

    setTimeout(() => {
      const html = receiptRef.current?.innerHTML;
      if (!html) return;

      // Create a hidden iframe for silent printing
      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        // Load the HTML and Tailwind CSS, wait a second for CSS to apply, then trigger print
        iframeDoc.write(`
          <html>
            <head>
              <title>Fee Receipt</title>
              <script src="https://cdn.tailwindcss.com"></script>
              <style>
                @page { margin: 0; }
                body { margin: 1cm; }
              </style>
            </head>
            <body>
              ${html}
              <script>
                setTimeout(() => {
                  window.focus();
                  window.print();
                }, 1500);
              </script>
            </body>
          </html>
        `);
        iframeDoc.close();
      }

      // Cleanup iframe after printing dialog has most likely closed
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 10000);
    }, 200);
  };

  return {
    schoolName,
    schoolAddress,
    schoolLogo,
    receiptData,
    receiptRef,
    printFeeReceipt,
  };
}
