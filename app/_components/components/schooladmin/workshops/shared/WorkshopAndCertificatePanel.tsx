import { Check, CheckCircle2, FileImage, Loader2, Upload } from "lucide-react";
import { formatDate, type HubEvent } from "./createHubTypes";

export function WorkshopAndCertificatePanel({
  events,
  selectedEventId,
  onSelectEvent,
  uploadingCert,
  certificateUrl,
  certificateFile,
  onCertUpload,
}: {
  events: HubEvent[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  uploadingCert: boolean;
  certificateUrl: string | null;
  certificateFile: File | null;
  onCertUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="xl:col-span-1 space-y-6">
      {/* 1. Select Workshop */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            1. Select Workshop
          </span>
          <span className="text-xs text-lime-300 border border-lime-400/30 bg-lime-400/10 px-2.5 py-1 rounded-full">
            {events.length} Events
          </span>
        </div>
        <div className="space-y-2 max-h-[200px] sm:max-h-[240px] overflow-y-auto no-scrollbar pr-1">
          {events.map((event) => {
            const isSelected = event.id === selectedEventId;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectEvent(event.id)}
                className={`w-full rounded-xl sm:rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 text-left transition-colors ${
                  isSelected
                    ? "border-lime-400/70 bg-white/10"
                    : "border-white/10 bg-black/20 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div
                    className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl flex items-center justify-center text-sm font-semibold shrink-0 ${
                      isSelected
                        ? "bg-lime-400 text-black"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {event.title?.[0] ?? "E"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-medium text-sm sm:text-base truncate ${
                        isSelected ? "text-white" : "text-white/50"
                      }`}
                    >
                      {event.title}
                    </div>
                    <div
                      className={`text-xs ${
                        isSelected ? "text-white/60" : "text-white/40"
                      }`}
                    >
                      {formatDate(event.eventDate) || "Date"} •{" "}
                      {event._count?.registrations ?? 0} enrolled
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle2 size={18} className="text-lime-300 shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
          {events.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-sm text-white/50 text-center">
              No events yet. Create one to get started.
            </div>
          )}
        </div>
      </div>

      {/* 2. Attach Certificate */}
      <div>
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          2. Attach Certificate
        </span>
        <label className="mt-3 block">
          <div className="rounded-xl sm:rounded-2xl border-2 border-dashed border-white/20 hover:border-lime-400/40 bg-black/20 p-4 sm:p-6 cursor-pointer transition-colors">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onCertUpload}
              disabled={uploadingCert}
            />
            {uploadingCert ? (
              <div className="flex flex-col items-center gap-2 text-white/60">
                <Loader2 size={32} className="animate-spin" />
                <span className="text-sm">Uploading...</span>
              </div>
            ) : certificateUrl ? (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-white/10 flex items-center justify-center text-lime-400 shrink-0">
                  <FileImage size={24} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {certificateFile?.name || "Certificate attached"}
                  </div>
                  <div className="text-xs text-white/50">Click to replace</div>
                </div>
                <Check size={18} className="text-lime-400 shrink-0" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/50">
                <Upload size={28} />
                <span className="text-sm">Upload certificate image</span>
                <span className="text-xs">JPEG, PNG or WebP</span>
              </div>
            )}
          </div>
        </label>
        {!certificateUrl && (
          <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-black/20 h-[200px] sm:h-[220px] lg:h-[240px] flex items-center justify-center text-white/40 text-sm">
            Upload a certificate first
          </div>
        )}
      </div>
    </div>
  );
}
