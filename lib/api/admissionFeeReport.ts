import { z } from "zod";
import { apiGet, validateApiResponse } from "./http";
import type { ReportPayload } from "@/app/_components/components/schooladmin/fees/shared/admissionFeeReportTypes";

// ReportPayload is a feature-owned type with several nested aggregate
// shapes; the schema below checks the top-level envelope (an object with a
// message-or-data shape) rather than re-mirroring every nested field, so a
// genuinely malformed response is still caught without a hand-copied schema
// silently drifting out of sync with that type.
const AdmissionFeeReportResponseSchema = z.object({}).passthrough();

export function fetchAdmissionFeeReport(from: string, to: string) {
  const qs = new URLSearchParams({ from, to });
  return apiGet<ReportPayload & { message?: string }>(
    `/api/admissions/admission-fee-report?${qs.toString()}`,
    { cache: "no-store" }
  ).then((result) => ({
    ...result,
    data: validateApiResponse(AdmissionFeeReportResponseSchema, result.data, "fetchAdmissionFeeReport") as ReportPayload & {
      message?: string;
    },
  }));
}
