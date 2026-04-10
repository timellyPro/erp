"use client";

import { useEffect, useState } from "react";
import { Bell, CreditCard, Lock, Mail, MapPin, Phone, User, X } from "lucide-react";
import SearchInput from "../common/SearchInput";
import { CardTitle, Field } from "./SettingsPrimitives";
import {
  CARD_BODY_CLASS,
  CARD_CLASS,
  CARD_HEADER_CLASS,
  CommonSettingsProps,
} from "./portalSettingsTypes";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export default function SchoolAdminSettingsView({
  form,
  setForm,
  passwords,
  setPasswords,
  fileInputRef,
  handleUploadAvatar,
  uploading,
}: CommonSettingsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        setLoadingNotifications(true);
        const res = await fetch("/api/notifications?take=10", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (error) {
        console.error("Failed to load notifications:", error);
      } finally {
        setLoadingNotifications(false);
      }
    };
    loadNotifications();
  }, []);

  const markOneRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <SchoolAdminAccountCard 
        form={form} 
        setForm={setForm}
        fileInputRef={fileInputRef}
        handleUploadAvatar={handleUploadAvatar}
        uploading={uploading}
      />
      <SchoolEmailDomainCard />
      <SchoolInstallmentsSettingsCard />
      <SchoolHyperPGCredentialsCard />
      <SchoolAdminPasswordCard passwords={passwords} setPasswords={setPasswords} />
      <SchoolAdminNotificationsCard
        notifications={notifications}
        unreadCount={unreadCount}
        loading={loadingNotifications}
        onMarkRead={markOneRead}
        formatTime={formatTime}
      />
    </div>
  );
}

function SchoolInstallmentsSettingsCard() {
  const [defaultInstallments, setDefaultInstallments] = useState("3");
  const [installmentReminderDates, setInstallmentReminderDates] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/settings", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && res.ok && data.settings) {
          const v = Number(data.settings.defaultInstallments ?? 3);
          const count = Number.isInteger(v) && v > 0 ? v : 3;
          setDefaultInstallments(String(count));
          const rawReminder = data.settings.installmentReminderDates;
          let parsed: string[] = [];
          if (typeof rawReminder === "string" && rawReminder.trim()) {
            try {
              const arr = JSON.parse(rawReminder);
              if (Array.isArray(arr)) {
                parsed = arr.map((x) => (typeof x === "string" ? x : "")).slice(0, count);
              }
            } catch {
              parsed = [];
            }
          }
          setInstallmentReminderDates(Array.from({ length: count }, (_, idx) => parsed[idx] || ""));
        }
      } catch (_) {
        if (!cancelled) setMessage({ type: "error", text: "Failed to load installments settings" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const parsed = Number(defaultInstallments);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setMessage({ type: "error", text: "Installments must be a positive integer" });
        setSaving(false);
        return;
      }
      const validDate = /^\d{4}-\d{2}-\d{2}$/;
      const normalizedDates = installmentReminderDates
        .slice(0, parsed)
        .map((d) => d.trim());
      for (let i = 0; i < normalizedDates.length; i++) {
        const d = normalizedDates[i];
        if (!d) continue;
        if (!validDate.test(d) || Number.isNaN(new Date(`${d}T00:00:00Z`).getTime())) {
          setMessage({ type: "error", text: `Installment ${i + 1} reminder date is invalid` });
          setSaving(false);
          return;
        }
      }
      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultInstallments: parsed, installmentReminderDates: normalizedDates }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Installments and reminder dates saved." });
      } else {
        setMessage({ type: "error", text: data?.message ?? "Failed to save" });
      }
    } catch (_) {
      setMessage({ type: "error", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <CardTitle
          icon={<CreditCard className="text-lime-300" size={22} />}
          title="Fee Installments Settings"
          subtitle="Set default installments for the whole school"
        />
      </div>
      <div className={CARD_BODY_CLASS}>
        {loading ? (
          <div className="flex items-center gap-2 text-white/60">
            <div className="w-4 h-4 border-2 border-white/20 border-t-lime-400 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Field label="Default Installments">
              <SearchInput
                value={defaultInstallments}
                onChange={(v) => {
                  const next = v.replace(/\D/g, "").slice(0, 2);
                  setDefaultInstallments(next);
                  const nextCount = Number(next);
                  if (Number.isInteger(nextCount) && nextCount > 0) {
                    setInstallmentReminderDates((prev) =>
                      Array.from({ length: nextCount }, (_, idx) => prev[idx] || "")
                    );
                  }
                }}
                icon={CreditCard}
                variant="glass"
                className="mt-2"
                placeholder="e.g. 3"
              />
              <p className="mt-2 text-xs text-white/50">
                This updates existing students and will be used for all future student fee records.
              </p>
            </Field>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {installmentReminderDates.map((value, index) => (
                <Field key={index} label={`Installment ${index + 1} reminder date`}>
                  <SearchInput
                    value={value}
                    onChange={(v) =>
                      setInstallmentReminderDates((prev) => {
                        const next = [...prev];
                        next[index] = v;
                        return next;
                      })
                    }
                    type="date"
                    icon={CreditCard}
                    variant="glass"
                    className="mt-2"
                  />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/50">
              These dates are reminder-only for each installment.
            </p>
            {message && (
              <p className={`mt-3 text-sm ${message.type === "success" ? "text-lime-400" : "text-red-400"}`}>
                {message.text}
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-4 px-5 py-2.5 rounded-xl bg-lime-400/20 text-lime-400 border border-lime-400/30 font-medium hover:bg-lime-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save installments settings"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SchoolEmailDomainCard() {
  const [emailDomain, setEmailDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/settings", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && res.ok && data.settings) {
          setEmailDomain(data.settings.emailDomain ?? "");
        }
      } catch (_) {
        if (!cancelled) setMessage({ type: "error", text: "Failed to load email settings" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDomain: emailDomain.trim() || null,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Email domain saved." });
      } else {
        setMessage({ type: "error", text: data?.message ?? "Failed to save" });
      }
    } catch (_) {
      setMessage({ type: "error", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <CardTitle
          icon={<Mail className="text-lime-300" size={22} />}
          title="Email Settings"
          subtitle="Email domain used for auto-generated user emails"
        />
      </div>
      <div className={CARD_BODY_CLASS}>
        {loading ? (
          <div className="flex items-center gap-2 text-white/60">
            <div className="w-4 h-4 border-2 border-white/20 border-t-lime-400 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Field label="Email Domain / Prefix">
              <SearchInput
                value={emailDomain}
                onChange={setEmailDomain}
                icon={Mail}
                variant="glass"
                className="mt-2"
                placeholder='e.g. "myschool" or "myschool.in" (no @)'
              />
              <p className="mt-2 text-xs text-white/50">
                Enter only prefix or full domain. Leave empty to auto-generate from School name. New users will get emails like{" "}
                <span className="text-white/70">firstname.lastname@yourdomain</span>.
              </p>
            </Field>
            {message && (
              <p className={`mt-3 text-sm ${message.type === "success" ? "text-lime-400" : "text-red-400"}`}>
                {message.text}
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-4 px-5 py-2.5 rounded-xl bg-lime-400/20 text-lime-400 border border-lime-400/30 font-medium hover:bg-lime-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save email settings"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SchoolAdminAccountCard({
  form,
  setForm,
  fileInputRef,
  handleUploadAvatar,
  uploading,
}: {
  form: CommonSettingsProps["form"];
  setForm: CommonSettingsProps["setForm"];
  fileInputRef?: CommonSettingsProps["fileInputRef"];
  handleUploadAvatar?: CommonSettingsProps["handleUploadAvatar"];
  uploading?: CommonSettingsProps["uploading"];
}) {
  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <CardTitle icon={<User className="text-lime-300" size={22} />} title="School Admin Account Information" subtitle="Update your personal details" />
      </div>
      <div className={CARD_BODY_CLASS}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <img 
              src={form.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name || "Admin")}&size=80&background=4ade80&color=fff`} 
              alt={form.name || "Admin"} 
              className="w-20 h-20 rounded-2xl object-cover border-2 border-white/[0.1]" 
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name || "Admin")}&size=80&background=4ade80&color=fff`;
              }}
              key={form.photoUrl}
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div>
            <h3 className="font-bold text-white">Admin Profile Photo</h3>
            <p className="text-sm text-gray-400">JPG, PNG or GIF. Max 2MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadAvatar}
            />
            <button 
              type="button" 
              onClick={() => fileInputRef?.current?.click()}
              disabled={uploading}
              className="mt-2 px-4 py-2 bg-[#A3E635]/20 text-[#A3E635] border border-[#A3E635]/30
               rounded-xl text-sm font-medium hover:bg-[#A3E635]/30 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">
              {uploading ? "Uploading..." : "Edit Photo"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Full Name">
            <SearchInput value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} icon={User} variant="glass" className="mt-2" />
          </Field>
          <Field label="Email Address">
            <SearchInput value={form.email} icon={Mail} variant="glass" className="mt-2" disabled />
          </Field>
          <Field label="Phone Number">
            <SearchInput value={form.mobile} onChange={(v) => setForm((p) => ({ ...p, mobile: v }))} icon={Phone} variant="glass" className="mt-2" />
          </Field>
          <Field label="Address">
            <SearchInput value={form.address || ""} onChange={(v) => setForm((p) => ({ ...p, address: v }))} icon={MapPin} variant="glass" className="mt-2" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function SchoolHyperPGCredentialsCard() {
  const [hyperpgMerchantId, setHyperpgMerchantId] = useState("");
  const [hyperpgApiKey, setHyperpgApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/settings", { credentials: "include" });
        const data = await res.json();
        if (!cancelled && res.ok && data.settings) {
          setHyperpgMerchantId(data.settings.hyperpgMerchantId ?? "");
          setHyperpgApiKey(data.settings.hyperpgApiKey ?? "");
        }
      } catch (_) {
        if (!cancelled) setMessage({ type: "error", text: "Failed to load payment settings" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/school/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hyperpgMerchantId: hyperpgMerchantId.trim() || null,
          hyperpgApiKey: hyperpgApiKey.trim() || null,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Payment credentials saved." });
      } else {
        setMessage({ type: "error", text: data?.message ?? "Failed to save" });
      }
    } catch (_) {
      setMessage({ type: "error", text: "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <CardTitle icon={<CreditCard className="text-lime-300" size={22} />} title="Payment (HyperPG)" subtitle="Each school has unique Merchant ID and API Key from the payments team" />
      </div>
      <div className={CARD_BODY_CLASS}>
        {loading ? (
          <div className="flex items-center gap-2 text-white/60">
            <div className="w-4 h-4 border-2 border-white/20 border-t-lime-400 rounded-full animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <Field label="HyperPG Merchant ID">
              <SearchInput value={hyperpgMerchantId} onChange={setHyperpgMerchantId} icon={CreditCard} variant="glass" className="mt-2" placeholder="e.g. timellytestmid" />
            </Field>
            <Field label="HyperPG API Key" className="mt-4">
              <SearchInput value={hyperpgApiKey} onChange={setHyperpgApiKey} type="password" icon={Lock} variant="glass" className="mt-2" placeholder="API key from payments team" />
            </Field>
            {message && (
              <p className={`mt-3 text-sm ${message.type === "success" ? "text-lime-400" : "text-red-400"}`}>
                {message.text}
              </p>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-4 px-5 py-2.5 rounded-xl bg-lime-400/20 text-lime-400 border border-lime-400/30 font-medium hover:bg-lime-400/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save payment credentials"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SchoolAdminPasswordCard({
  passwords,
  setPasswords,
}: {
  passwords: CommonSettingsProps["passwords"];
  setPasswords: CommonSettingsProps["setPasswords"];
}) {
  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <CardTitle icon={<Lock className="text-lime-300" size={22} />} title="Security & Password" subtitle="Manage your password and security" />
      </div>
      <div className={CARD_BODY_CLASS}>
        <Field label="Current Password">
          <SearchInput value={passwords.currentPassword} onChange={(v) => setPasswords((p) => ({ ...p, currentPassword: v }))} type="password" variant="glass" className="mt-2" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Field label="New Password">
            <SearchInput value={passwords.newPassword} onChange={(v) => setPasswords((p) => ({ ...p, newPassword: v }))} type="password" variant="glass" className="mt-2" />
          </Field>
          <Field label="Confirm Password">
            <SearchInput value={passwords.confirmPassword} onChange={(v) => setPasswords((p) => ({ ...p, confirmPassword: v }))} type="password" variant="glass" className="mt-2" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function SchoolAdminNotificationsCard({
  notifications,
  unreadCount,
  loading,
  onMarkRead,
  formatTime,
}: {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  onMarkRead: (id: string) => void;
  formatTime: (dateString: string) => string;
}) {
  return (
    <div className={CARD_CLASS}>
      <div className={CARD_HEADER_CLASS}>
        <CardTitle icon={<Bell className="text-lime-300" size={22} />} title="Notifications" subtitle={`${unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}`} />
      </div>
      <div className={CARD_BODY_CLASS}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="ml-2 text-sm text-white/60">Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/40">
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                className={`w-full text-left rounded-xl bg-white/5 p-4 border border-white/10 hover:bg-white/10 transition ${
                  n.isRead ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium">{n.title}</h3>
                  {!n.isRead && (
                    <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                      New
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 mt-1 line-clamp-2">
                  {n.message}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {formatTime(n.createdAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
