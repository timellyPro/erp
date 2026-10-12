"use client";

import { motion } from "framer-motion";
import { AlertCircle, CheckCircle, User, Briefcase, Lock } from "lucide-react";
import InputField from "./InputField";
import RoleSelector from "./RoleSelector";
import Spinner from "../../common/Spinner";
import type { UserFormProps } from "./shared";
import { useUserFormState } from "./shared";
import { TeacherDetailsFields } from "./shared";
import { AccessControlPanel } from "./shared";

export default function UserForm(props: UserFormProps) {
  const { mode = "create" } = props;
  const {
    userId,
    loading,
    detailLoading,
    submitting,
    error,
    fieldErrors,
    setFieldErrors,
    success,
    schoolEmailDomain,
    emailSettingsLoading,
    formData,
    classesList,
    subjectInput,
    setSubjectInput,
    availableSubjects,
    subjectsDropdownOpen,
    setSubjectsDropdownOpen,
    handleChange,
    handleFeatureToggle,
    handleToggleAllFeatures,
    handleSubmit,
    cancelToUserList,
  } = useUserFormState(props);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {detailLoading ? (
        <p className="text-xs text-cyan-200/70">Loading full teacher profile…</p>
      ) : null}
      {/* Top Section: Form Fields + Access Control */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form Inputs (2/3 width) */}
        <div className="col-span-1 lg:col-span-2 space-y-6 bg-white/5 backdrop-blur-xl rounded-2xl p-6 md:p-8 border border-white/10">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-lime-400/20 flex items-center justify-center">
                <User className="w-5 h-5 text-lime-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">User Information</h2>
                <p className="text-xs text-white/50">
                  Add new users and configure their access to Timelly.
                </p>
              </div>
            </div>
          </div>

          {/* User Role Pills */}
          <div>
            <RoleSelector
              value={formData.role}
              onChange={(role) => {
                handleChange("role", role);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  (
                    [
                      "subjects",
                      "teacherId",
                      "qualification",
                      "experience",
                      "joiningDate",
                      "mobile",
                      "address",
                    ] as const
                  ).forEach((k) => {
                    delete next[k];
                  });
                  return next;
                });
              }}
            />
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField
              label="Full Name"
              value={formData.name}
              onChange={(v) => handleChange("name", v)}
              placeholder="Enter full name"
              icon={<User className="w-4 h-4" />}
              required
              error={fieldErrors.name}
            />

            <InputField
              label="Designation"
              value={formData.designation || ""}
              onChange={(v) => handleChange("designation", v)}
              placeholder="e.g. Senior Teacher"
              icon={<Briefcase className="w-4 h-4" />}
              error={fieldErrors.designation}
            />

            <div className="md:col-span-2">
              <p className="text-[11px] text-white/50">
                Email is auto-generated from full name using your school email domain
                {emailSettingsLoading ? "" : schoolEmailDomain ? ` (${schoolEmailDomain})` : ""}.
              </p>
            </div>
            <InputField
              label={`Password ${mode === "create" ? "" : "(Leave blank to keep unchanged)"}`}
              value={formData.password || ""}
              onChange={(v) => handleChange("password", v)}
              placeholder="Min 8 chars, letter + number"
              icon={<Lock className="w-4 h-4" />}
              type="password"
              required={mode === "create"}
              autoComplete="new-password"
              error={fieldErrors.password}
            />

            {formData.password && (
              <InputField
                label="Confirm Password"
                value={formData.confirmPassword || ""}
                onChange={(v) => handleChange("confirmPassword", v)}
                placeholder="Confirm password"
                icon={<Lock className="w-4 h-4" />}
                type="password"
                required
                autoComplete="new-password"
                error={fieldErrors.confirmPassword}
              />
            )}
          </div>

          {/* Teacher-specific fields */}
          {formData.role === "TEACHER" && (
            <TeacherDetailsFields
              formData={formData}
              fieldErrors={fieldErrors}
              onChange={handleChange}
              classesList={classesList}
              subjectInput={subjectInput}
              onSubjectInputChange={setSubjectInput}
              availableSubjects={availableSubjects}
              subjectsDropdownOpen={subjectsDropdownOpen}
              onSubjectsDropdownOpenChange={setSubjectsDropdownOpen}
            />
          )}
        </div>

        {/* Right: Access Control Toggles (1/3 width) */}
        <AccessControlPanel
          allowedFeatures={formData.allowedFeatures}
          fieldErrors={fieldErrors}
          onToggleFeature={handleFeatureToggle}
          onToggleAll={handleToggleAllFeatures}
        />
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/30"
        >
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </motion.div>
      )}

      {/* Success Message */}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-lime-400/20 border border-lime-400/30"
        >
          <CheckCircle size={18} className="text-lime-400 flex-shrink-0" />
          <span className="text-sm text-lime-300">
            User {userId ? "updated" : "created"} successfully!
          </span>
        </motion.div>
      )}

      {/* Submit Buttons */}
      <div className="flex justify-end pt-4 gap-3">
        <motion.button
          type="submit"
          disabled={submitting || detailLoading}
          whileHover={{ x: 4 }}
          className="px-6 py-3 bg-lime-400 hover:bg-lime-500 text-black font-bold rounded-xl
          shadow-lg shadow-lime-400/20 transition-all flex items-center gap-2 disabled:opacity-60 disabled:pointer-events-none"
        >
          {submitting ? (
            <>
              <Spinner color="black" />
              Saving...
            </>
          ) : (
            <><User className="lucide lucide-user-plus w-5 h-5" /> {userId ? "Update" : "Create"} User
            </>
          )}
        </motion.button>
        <motion.button
          type="button"
          onClick={cancelToUserList}
          disabled={submitting}
          whileHover={{ x: -4 }}
          className="px-6 py-3 border border-white/10 text-gray-400
           font-medium rounded-xl hover:bg-white/5 transition-all"
        >
          Cancel
        </motion.button>
      </div>
    </form>
  );
}
