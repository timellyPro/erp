import { useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { SchoolFormState } from "../../../../interfaces/dashboard";
import { createSchool } from "@/lib/api/superadminSchools";

export type FormErrors = {
  schoolName?: string;
  password?: string;
  email?: string;
  phone?: string;
  pincode?: string;
};

const blankForm = (): SchoolFormState => ({
  schoolName: "",
  password: "",
  phone: "",
  email: "",
  classRange: "",
  board: "",
  addressLine: "",
  pincode: "",
  area: "",
  city: "",
  district: "",
  state: "",
  billingMode: "PARENT_SUBSCRIPTION",
  parentSubscriptionAmount: "",
  parentSubscriptionTrialDays: "",
});

export function useAddSchoolState() {
  const router = useRouter();

  const [form, setForm] = useState<SchoolFormState>(blankForm());

  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const hasFieldErrors = Object.values(errors).some(Boolean);

  /* ---------------- Input Handler ---------------- */

  const handleChange =
    (field: keyof SchoolFormState) =>
      (value: string) => {

        /* Phone → only digits + 10 limit */
        if (field === "phone") {
          const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
          setForm((prev) => ({ ...prev, phone: digitsOnly }));
          setErrors((prev) => ({ ...prev, phone: "" }));
          return;
        }

        /* Pincode → digits only */
        if (field === "pincode") {
          const digitsOnly = value.replace(/\D/g, "");
          setForm((prev) => ({ ...prev, pincode: digitsOnly }));
          setErrors((prev) => ({ ...prev, pincode: "" }));
          return;
        }

        setForm((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: "" }));
      };

  /* ---------------- Validation ---------------- */

  const validateForm = () => {
    const newErrors: FormErrors = {};

    if (!form.schoolName.trim()) {
      newErrors.schoolName = "School name is required";
    }

    if (!form.password.trim()) {
      newErrors.password = "Password is required";
    }

    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      newErrors.email = "Enter a valid email address";
    }

    if (form.phone && form.phone.length !== 10) {
      newErrors.phone = "Phone must be 10 digits";
    }

    if (form.pincode && !/^\d+$/.test(form.pincode)) {
      newErrors.pincode = "Pincode must contain digits only";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /* ---------------- Submit Handler ---------------- */

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) return;
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const { ok, status, data } = await createSchool(
        {
          schoolName: form.schoolName,
          email: form.email,
          password: form.password,
          address: [form.addressLine, form.area, form.city, form.district, form.state].filter(Boolean).join(", ") || form.schoolName,
          location: form.area || form.city || "",
          phone: form.phone || undefined,
          billingMode: form.billingMode,
          parentSubscriptionAmount: form.parentSubscriptionAmount
            ? parseFloat(form.parentSubscriptionAmount)
            : undefined,
          parentSubscriptionTrialDays: form.parentSubscriptionTrialDays
            ? parseInt(form.parentSubscriptionTrialDays, 10)
            : undefined,
        },
        controller.signal
      );

      clearTimeout(timeoutId);

      if (!ok) {
        setError(data?.message || `Failed to create school (${status})`);
        return;
      }
      setShowSuccess(true);
      try {
        router.refresh();
      } catch {
        /* noop */
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setError("Request timed out. Please try again.");
        } else {
          setError(err.message || "Something went wrong");
        }
      } else {
        setError("Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- Reset ---------------- */

  const handleReset = () => {
    setForm(blankForm());
    setErrors({});
  };

  return {
    form,
    setForm,
    errors,
    loading,
    error,
    showSuccess,
    setShowSuccess,
    hasFieldErrors,
    handleChange,
    handleSignup,
    handleReset,
  };
}
