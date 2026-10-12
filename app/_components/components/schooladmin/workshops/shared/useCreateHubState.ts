import { useCallback, useEffect, useState } from "react";
import { uploadImage, uploadBlob } from "@/app/_components/utils/upload";
import {
  generateCertificateWithName,
  type ClickPosition,
  type NameTextStyle,
  DEFAULT_TEXT_STYLE,
} from "../certificateUtils";
import type { HubEvent, HubStudent } from "./createHubTypes";

export function useCreateHubState({ events }: { events: HubEvent[] }) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [namePosition, setNamePosition] = useState<ClickPosition | null>(null);
  const [nameTextStyle, setNameTextStyle] = useState<NameTextStyle>(DEFAULT_TEXT_STYLE);
  const [students, setStudents] = useState<HubStudent[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    new Set()
  );
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignProgress, setAssignProgress] = useState({ current: 0, total: 0 });
  const [showPopup, setShowPopup] = useState(false);
  const [popupStage, setPopupStage] = useState<"generating" | "done">(
    "generating"
  );
  const [error, setError] = useState<string | null>(null);
  const [previewImgSize, setPreviewImgSize] = useState<{ w: number; h: number } | null>(null);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  const fetchRegistrations = useCallback(async (eventId: string) => {
    setLoadingStudents(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/registrations`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to load enrolled students");
      }
      const list = Array.isArray(data?.students) ? data.students : [];
      setStudents(list);
      setSelectedStudentIds(new Set(list.map((s: HubStudent) => s.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load students");
      setStudents([]);
      setSelectedStudentIds(new Set());
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchRegistrations(selectedEventId);
    } else {
      setStudents([]);
      setSelectedStudentIds(new Set());
    }
  }, [selectedEventId, fetchRegistrations]);

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Please upload JPEG, PNG, or WebP image");
      return;
    }
    setError(null);
    setCertificateFile(file);
    setUploadingCert(true);
    setNamePosition(null);
    setPreviewImgSize(null);
    try {
      const url = await uploadImage(file, "certificates");
      setCertificateUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setCertificateFile(null);
      setCertificateUrl(null);
    } finally {
      setUploadingCert(false);
    }
    e.target.value = "";
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedStudentIds(new Set(students.map((s) => s.id)));
  };

  const deselectAll = () => {
    setSelectedStudentIds(new Set());
  };

  const createTemplateAndAssign = async () => {
    if (!selectedEvent || !certificateUrl) {
      setError("Please select workshop and attach certificate.");
      return;
    }
    if (!namePosition) {
      setError("Please click on the certificate preview to set the name position.");
      return;
    }
    const toAssign = students.filter((s) => selectedStudentIds.has(s.id));
    if (toAssign.length === 0) {
      setError("Please select at least one student");
      return;
    }

    setError(null);
    setAssigning(true);

    try {
      const templateRes = await fetch("/api/certificates/workshop/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventTitle: selectedEvent.title,
          imageUrl: certificateUrl,
        }),
      });
      const templateData = await templateRes.json();
      if (!templateRes.ok) {
        throw new Error(templateData?.message || "Failed to create template");
      }
      const tid = templateData?.template?.id;
      if (!tid) throw new Error("No template ID returned");

      setAssignProgress({ current: 0, total: toAssign.length });

      for (let i = 0; i < toAssign.length; i++) {
        const student = toAssign[i];
        setAssignProgress({ current: i + 1, total: toAssign.length });
        try {
          const studentName = (student.name ?? "").trim() || "Participant";
          const blob = await generateCertificateWithName(
            certificateUrl,
            studentName,
            namePosition,
            nameTextStyle
          );
          const filename = `cert-${selectedEvent.title.replace(/\W/g, "-")}-${student.id}.png`;
          const certUrl = await uploadBlob(blob, filename, "certificates");

          const res = await fetch("/api/certificates/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              templateId: tid,
              studentId: student.id,
              title: `${selectedEvent.title} - Participation`,
              description: `Certificate of participation for ${selectedEvent.title}`,
              certificateUrl: certUrl,
              eventId: selectedEvent.id,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.message || "Assign failed");
          }
        } catch (err) {
          console.error("Assign error for", student.name, err);
          setError(
            `Failed for ${student.name}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }

      setShowPopup(true);
      setPopupStage("done");
      setCertificateFile(null);
      setCertificateUrl(null);
      setNamePosition(null);
      setNameTextStyle(DEFAULT_TEXT_STYLE);
      setSelectedStudentIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setAssigning(false);
      setAssignProgress({ current: 0, total: 0 });
    }
  };

  useEffect(() => {
    if (!showPopup) return;
    if (popupStage === "done") return;
    const t = setTimeout(() => setPopupStage("done"), 1200);
    return () => clearTimeout(t);
  }, [showPopup, popupStage]);

  const selectedCount = selectedStudentIds.size;
  const canAssign =
    selectedEvent &&
    certificateUrl &&
    namePosition !== null &&
    selectedCount > 0 &&
    !assigning &&
    !uploadingCert &&
    students.length > 0;

  const handlePreviewClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!certificateUrl) return;
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const xPercent = Math.max(0, Math.min(1, clickX / rect.width));
    const yPercent = Math.max(0, Math.min(1, clickY / rect.height));
    setNamePosition({ xPercent, yPercent });
  };

  const handlePreviewImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setPreviewImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    }
  };

  return {
    selectedEventId,
    setSelectedEventId,
    certificateFile,
    certificateUrl,
    namePosition,
    nameTextStyle,
    setNameTextStyle,
    students,
    selectedStudentIds,
    loadingStudents,
    uploadingCert,
    assigning,
    assignProgress,
    showPopup,
    setShowPopup,
    popupStage,
    error,
    previewImgSize,
    selectedEvent,
    handleCertUpload,
    toggleStudent,
    selectAll,
    deselectAll,
    createTemplateAndAssign,
    selectedCount,
    canAssign,
    handlePreviewClick,
    handlePreviewImgLoad,
  };
}
