import { useRef, useState } from "react";
import type React from "react";
import { uploadImage } from "../../../../utils/upload";
import { PUBLISH_STATUS, type CircularFormState } from "./circularFormConstants";

export function useCircularFormState({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [selected, setSelected] = useState<"High" | "Medium" | "Low">("Medium");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CircularFormState>({
    referenceNumber: "",
    date: new Date().toISOString().slice(0, 10),
    subject: "",
    issuedBy: "",
    content: "",
    importanceLevel: "Medium",
    recipients: [],
    classId: "",
    publishStatus: PUBLISH_STATUS.PUBLISHED,
    attachments: [],
  });

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setAttachmentUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadImage(file, "circulars");
        setForm((prev) => ({ ...prev, attachments: [...prev.attachments, url] }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload attachment");
    } finally {
      setAttachmentUploading(false);
      e.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const toggleRecipient = (value: string) => {
    setForm((prev) => {
      // If "All" is clicked
      if (value === "all") {
        return {
          ...prev,
          recipients: prev.recipients.includes("all") ? [] : ["all"],
        };
      }

      // If some other recipient is clicked
      let updatedRecipients = prev.recipients.filter((r) => r !== "all");

      if (updatedRecipients.includes(value)) {
        updatedRecipients = updatedRecipients.filter((r) => r !== value);
      } else {
        updatedRecipients.push(value);
      }

      return {
        ...prev,
        recipients: updatedRecipients,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/circular/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create circular");

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create circular");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    submitting,
    error,
    attachmentUploading,
    selected,
    setSelected,
    fileInputRef,
    form,
    setForm,
    handleAttachFile,
    removeAttachment,
    toggleRecipient,
    handleSubmit,
  };
}
