"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Mail, Phone, User, Lock } from "lucide-react";
import PageHeader from "../common/PageHeader";
import SearchInput from "../common/SearchInput";
import { PRIMARY_COLOR } from "../../constants/colors";

type SchoolOption = {
  id: string;
  name: string;
  location?: string;
  users?: ChairmanUser[];
};

type ChairmanUser = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  createdAt: string;
};

type FormState = {
  schoolId: string;
  name: string;
  email: string;
  password: string;
  mobile: string;
};

const emptyForm: FormState = {
  schoolId: "",
  name: "",
  email: "",
  password: "",
  mobile: "",
};

export default function AddChairman() {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchSchools = useCallback(async () => {
    setLoadingSchools(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/chairmen", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to load chairman schools");
      setSchools(Array.isArray(data.schools) ? data.schools : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schools");
      setSchools([]);
    } finally {
      setLoadingSchools(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchools();
  }, [fetchSchools]);

  const handleChange = (field: keyof FormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: field === "mobile" ? value.replace(/\D/g, "").slice(0, 10) : value }));
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.schoolId || !form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("School, chairman name, email and password are required.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/chairmen/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to create chairman");
      setSuccess(data.message || "Chairman account created.");
      setForm(emptyForm);
      await fetchSchools();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chairman");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full space-y-6">
        <PageHeader
          title="Add Chairman"
          subtitle="Create a chairman login for a selected school. Chairman accounts use the normal login page."
          className="w-full mb-0"
        />

        <form
          onSubmit={handleSubmit}
          className="w-full rounded-2xl border border-gray-500/20 p-4 shadow-sm sm:p-6 lg:p-8"
          style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
        >
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-xl font-semibold text-white sm:text-2xl">Chairman Account</h1>
            <button
              type="submit"
              disabled={saving || loadingSchools}
              style={{ backgroundColor: PRIMARY_COLOR }}
              className="w-full rounded-lg px-6 py-2 font-medium text-black hover:opacity-90 disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Creating..." : "Create Chairman"}
            </button>
          </div>

          {error ? <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
          {success ? <p className="mb-4 rounded-xl bg-lime-500/10 p-3 text-sm text-lime-300">{success}</p> : null}

          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                <Building2 className="h-4 w-4 text-white/50" />
                School *
              </label>
              <select
                value={form.schoolId}
                onChange={(event) => handleChange("schoolId")(event.target.value)}
                disabled={loadingSchools}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-lime-400/70 disabled:opacity-60"
              >
                <option value="">{loadingSchools ? "Loading schools..." : "Select school"}</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                    {school.location ? ` - ${school.location}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <SearchInput
              label="Chairman Name *"
              placeholder="Chairman name"
              value={form.name}
              onChange={handleChange("name")}
              icon={User}
            />

            <SearchInput
              label="Chairman Email *"
              type="email"
              placeholder="chairman@example.com"
              value={form.email}
              onChange={handleChange("email")}
              icon={Mail}
            />

            <SearchInput
              label="Password *"
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange("password")}
              icon={Lock}
            />

            <SearchInput
              label="Mobile"
              placeholder="10 digit mobile number"
              value={form.mobile}
              onChange={handleChange("mobile")}
              icon={Phone}
            />
          </div>
        </form>

        <section className="rounded-2xl border border-gray-500/20 bg-white/5 p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">School-wise Chairman List</h2>
              <p className="text-sm text-white/60">Shows every school and the chairman accounts created for it.</p>
            </div>
            <button
              type="button"
              onClick={() => void fetchSchools()}
              disabled={loadingSchools}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60"
            >
              {loadingSchools ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loadingSchools ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-sm text-white/60">
              Loading chairman list...
            </div>
          ) : schools.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-sm text-white/60">
              No schools found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-white/50">
                  <tr className="border-b border-white/10">
                    <th className="px-3 py-3">School</th>
                    <th className="px-3 py-3">Location</th>
                    <th className="px-3 py-3">Chairman</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Mobile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-white/80">
                  {schools.map((school) => {
                    const chairmen = Array.isArray(school.users) ? school.users : [];
                    if (chairmen.length === 0) {
                      return (
                        <tr key={school.id}>
                          <td className="px-3 py-3 font-medium text-white">{school.name}</td>
                          <td className="px-3 py-3">{school.location || "-"}</td>
                          <td className="px-3 py-3 text-amber-300">Not created</td>
                          <td className="px-3 py-3">-</td>
                          <td className="px-3 py-3">-</td>
                        </tr>
                      );
                    }

                    return chairmen.map((chairman, index) => (
                      <tr key={`${school.id}-${chairman.id}`}>
                        <td className="px-3 py-3 font-medium text-white">{index === 0 ? school.name : ""}</td>
                        <td className="px-3 py-3">{index === 0 ? school.location || "-" : ""}</td>
                        <td className="px-3 py-3">{chairman.name || "-"}</td>
                        <td className="px-3 py-3">{chairman.email || "-"}</td>
                        <td className="px-3 py-3">{chairman.mobile || "-"}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
