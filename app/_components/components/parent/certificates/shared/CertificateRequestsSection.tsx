import ParentTimellyLoader from "../../ParentTimellyLoader";
import CertificateRequestCard from "../CertificateRequestCard";
import { addDays, daysSince, formatDate, type CertificateRequest } from "./parentCertificatesHelpers";

export function CertificateRequestsSection({
  loading,
  certificateRequests,
  pendingRequests,
  approvedRequests,
  rejectedRequests,
}: {
  loading: boolean;
  certificateRequests: CertificateRequest[];
  pendingRequests: CertificateRequest[];
  approvedRequests: CertificateRequest[];
  rejectedRequests: CertificateRequest[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-white font-bold text-base md:text-lg">Certificate Requests</h4>
        <div className="text-xs text-gray-400">
          Pending: <span className="text-orange-400 font-semibold">{pendingRequests.length}</span>{" "}
          • Approved: <span className="text-lime-400 font-semibold">{approvedRequests.length}</span>{" "}
          • Rejected: <span className="text-red-400 font-semibold">{rejectedRequests.length}</span>
        </div>
      </div>

      {loading ? (
        <ParentTimellyLoader preset="certificates" compact className="w-full" />
      ) : certificateRequests.length === 0 ? (
        <div className="py-6 text-center text-gray-400 text-sm">No certificate requests yet.</div>
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pendingRequests.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-sm font-semibold text-orange-300">Pending</h5>
              {pendingRequests.map((req) => {
                const elapsedDays = daysSince(req.createdAt);
                const expected = addDays(req.createdAt, 7);
                const progress = Math.min(100, Math.round((elapsedDays / 7) * 100));
                return (
                  <CertificateRequestCard
                    key={req.id}
                    title={req.certificateType || "Certificate Request"}
                    purpose={req.reason || "-"}
                    requestId={req.id.slice(0, 8).toUpperCase()}
                    status="processing"
                    requestDate={formatDate(req.createdAt)}
                    secondDateLabel="Expected by"
                    secondDate={formatDate(expected)}
                    daysElapsed={`${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`}
                    progress={progress}
                    downloadUrl={null}
                  />
                );
              })}
            </div>
          )}

          {/* Approved */}
          {approvedRequests.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-sm font-semibold text-lime-300">Approved</h5>
              {approvedRequests.map((req) => {
                const elapsedDays = daysSince(req.createdAt);
                const approvedOn = req.issuedDate || req.updatedAt || req.createdAt;
                return (
                  <CertificateRequestCard
                    key={req.id}
                    title={req.certificateType || "Certificate Request"}
                    purpose={req.reason || "-"}
                    requestId={req.id.slice(0, 8).toUpperCase()}
                    status="ready"
                    requestDate={formatDate(req.createdAt)}
                    secondDateLabel="Approved on"
                    secondDate={formatDate(approvedOn)}
                    daysElapsed={`${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`}
                    downloadUrl={req.tcDocumentUrl}
                  />
                );
              })}
            </div>
          )}

          {/* Rejected */}
          {rejectedRequests.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-sm font-semibold text-red-300">Rejected</h5>
              {rejectedRequests.map((req) => {
                const elapsedDays = daysSince(req.createdAt);
                const rejectedOn = req.updatedAt || req.createdAt;
                return (
                  <CertificateRequestCard
                    key={req.id}
                    title={req.certificateType || "Certificate Request"}
                    purpose={req.reason || "-"}
                    requestId={req.id.slice(0, 8).toUpperCase()}
                    status="rejected"
                    requestDate={formatDate(req.createdAt)}
                    secondDateLabel="Rejected on"
                    secondDate={formatDate(rejectedOn)}
                    daysElapsed={`${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`}
                    downloadUrl={null}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
