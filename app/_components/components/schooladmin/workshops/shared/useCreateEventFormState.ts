import { useEffect, useRef, useState } from "react";
import { useClasses } from "@/app/_components/hooks/useClasses";
import { eventTypeOptions, type CreateEventFormProps } from "./createEventFormOptions";
import { getErrorMessage } from "@/lib/errors/errorInfo";

export function useCreateEventFormState({ onCancel, onCreated, initialEvent }: CreateEventFormProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [mode, setMode] = useState("");
  const [description, setDescription] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [maxSeats, setMaxSeats] = useState<string>("");
  const [amount, setAmount] = useState<string>("0");
  const [classId, setClassId] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [classStudents, setClassStudents] = useState<{ id: string; user?: { name?: string | null }; class?: { name: string; section: string | null } }[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successTitle, setSuccessTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isEditing = Boolean(initialEvent?.id);
  const { classes } = useClasses();

  useEffect(() => {
    if (!classId) {
      setClassStudents([]);
      setStudentIds([]);
      return;
    }
    fetch(`/api/class/students?classId=${encodeURIComponent(classId)}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setClassStudents(data.students ?? []);
        setStudentIds([]);
      })
      .catch(() => setClassStudents([]));
  }, [classId]);

  const toDateInputValue = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-CA");
  };

  const toTimeInputValue = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  useEffect(() => {
    if (!initialEvent) return;
    setTitle(initialEvent.title ?? "");
    setDescription(initialEvent.description ?? "");
    setType(initialEvent.type ?? "");
    setDifficulty(initialEvent.level ?? "");
    setLocation(initialEvent.location ?? "");
    setMode(initialEvent.mode ?? "");
    setAdditionalInfo(initialEvent.additionalInfo ?? "");
    setMaxSeats(initialEvent.maxSeats != null ? String(initialEvent.maxSeats) : "");
    setAmount(initialEvent.amount != null ? String(initialEvent.amount) : "0");
    setDate(toDateInputValue(initialEvent.eventDate));
    setTime(toTimeInputValue(initialEvent.eventDate));
    setPhotoFile(null);
    setPhotoDataUrl(initialEvent.photo ?? null);
    setClassId(initialEvent.classId ?? "");
  }, [initialEvent]);

  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => {
      setShowSuccess(false);
      onCancel?.();
    }, 1800);
    return () => clearTimeout(timer);
  }, [showSuccess, onCancel]);

  const handlePublish = async () => {
    setError(null);

    if (!title || !description || !type || !difficulty || !location || !mode || !additionalInfo) {
      setError("Please fill all required fields before publishing.");
      return;
    }

    const eventDate =
      date && time
        ? new Date(`${date}T${time}:00`).toISOString()
        : date
          ? new Date(`${date}T00:00:00`).toISOString()
          : null;

    try {
      setSubmitting(true);
      const res = await fetch(isEditing ? `/api/events/${initialEvent?.id}` : "/api/events/create", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          type,
          level: difficulty,
          location,
          mode,
          additionalInfo,
          eventDate,
          photo: photoDataUrl || null,
          maxSeats: maxSeats ? parseInt(maxSeats, 10) : null,
          amount: amount ? parseFloat(amount) : 0,
          classId: classId || null,
          studentIds: studentIds.length > 0 ? studentIds : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to create event");
      }

      if (!isEditing) {
        setTitle("");
        setDate("");
        setTime("");
        setLocation("");
        setType("");
        setDifficulty("");
        setMode("");
        setDescription("");
        setAdditionalInfo("");
        setMaxSeats("");
        setAmount("0");
        setClassId("");
        setStudentIds([]);
        setPhotoFile(null);
        setPhotoDataUrl(null);
      }

      onCreated?.(data?.event);
      const selectedLabel =
        eventTypeOptions.find((opt) => opt.id === type)?.name ?? "Event";
      const normalizedLabel =
        selectedLabel.toLowerCase() === "events" ? "Event" : selectedLabel;
      setSuccessTitle(
        isEditing
          ? `${normalizedLabel} updated successfully`
          : `${normalizedLabel} created successfully`
      );
      setShowSuccess(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    title,
    setTitle,
    date,
    setDate,
    time,
    setTime,
    location,
    setLocation,
    type,
    setType,
    difficulty,
    setDifficulty,
    mode,
    setMode,
    description,
    setDescription,
    additionalInfo,
    setAdditionalInfo,
    maxSeats,
    setMaxSeats,
    amount,
    setAmount,
    classId,
    setClassId,
    studentIds,
    setStudentIds,
    classStudents,
    photoFile,
    setPhotoFile,
    photoDataUrl,
    setPhotoDataUrl,
    photoUploading,
    setPhotoUploading,
    submitting,
    error,
    showSuccess,
    setShowSuccess,
    successTitle,
    fileInputRef,
    isEditing,
    classes,
    handlePublish,
  };
}
