import {
  School,
  Lock,
  Phone,
  Mail,
  MapPin,
  Hash,
  Map,
  Building2,
  Landmark,
  Globe,
} from "lucide-react";
import SearchInput from "../../../common/SearchInput";
import FormSection from "../../../common/FormSection";
import { SchoolFormState } from "../../../../interfaces/dashboard";
import type { FormErrors } from "./useAddSchoolState";

export function AddSchoolFormFields({
  form,
  setForm,
  errors,
  handleChange,
}: {
  form: SchoolFormState;
  setForm: (updater: (prev: SchoolFormState) => SchoolFormState) => void;
  errors: FormErrors;
  handleChange: (field: keyof SchoolFormState) => (value: string) => void;
}) {
  return (
    <>
      <FormSection title="Basic Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <SearchInput
            label="School Name *"
            placeholder="School Name"
            value={form.schoolName}
            onChange={handleChange("schoolName")}
            error={errors.schoolName}
            icon={School}
          />

          <SearchInput
            label="Password *"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange("password")}
            error={errors.password}
            icon={Lock}
          />
        </div>
      </FormSection>

      <FormSection title="Subscription Settings (SaaS)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div>
            <p className="text-sm font-medium text-white mb-2">Billing Mode</p>
            <p className="text-xs text-white/60 mb-3">
              Choose how this school pays for Timelly.
            </p>
            <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    billingMode: "SCHOOL_PAID",
                    parentSubscriptionAmount: "",
                    parentSubscriptionTrialDays: "",
                  }))
                }
                className={`px-3 py-2 text-xs sm:text-sm rounded-lg font-medium ${
                  form.billingMode === "SCHOOL_PAID"
                    ? "bg-lime-400 text-black"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                School Paid (no parent subscription)
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    billingMode: "PARENT_SUBSCRIPTION",
                  }))
                }
                className={`ml-1 px-3 py-2 text-xs sm:text-sm rounded-lg font-medium ${
                  form.billingMode === "PARENT_SUBSCRIPTION"
                    ? "bg-lime-400 text-black"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                Parent Subscription (per annum)
              </button>
            </div>
          </div>
          {form.billingMode === "PARENT_SUBSCRIPTION" && (
            <>
              <SearchInput
                label="Parent Subscription Amount (₹)"
                placeholder="e.g. 2999"
                value={form.parentSubscriptionAmount || ""}
                onChange={handleChange("parentSubscriptionAmount")}
                icon={Globe}
              />
              <SearchInput
                label="Free Trial Days"
                placeholder="e.g. 14"
                value={form.parentSubscriptionTrialDays || ""}
                onChange={handleChange("parentSubscriptionTrialDays")}
                icon={Hash}
              />
            </>
          )}
        </div>
      </FormSection>

      <FormSection title="Contact Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <SearchInput
            label="Phone"
            placeholder="Contact number"
            value={form.phone}
            onChange={handleChange("phone")}
            error={errors.phone}
            icon={Phone}
          />

          <SearchInput
            label="Email *"
            type="email"
            placeholder="example@gmail.com"
            value={form.email}
            onChange={handleChange("email")}
            error={errors.email}
            icon={Mail}
          />
        </div>
      </FormSection>

      <FormSection title="Address Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <SearchInput
            label="Address Line"
            value={form.addressLine}
            placeholder="Enter address line"
            onChange={handleChange("addressLine")}
            icon={MapPin}
          />

          <SearchInput
            label="Pincode"
            value={form.pincode}
            onChange={handleChange("pincode")}
            placeholder="Enter pincode"
            error={errors.pincode}
            icon={Hash}
          />

          <SearchInput
            label="Area / Locality"
            value={form.area}
            onChange={handleChange("area")}
            placeholder="Enter area / locality"
            icon={Map}
          />

          <SearchInput
            label="City"
            value={form.city}
            onChange={handleChange("city")}
            placeholder="Enter city"
            icon={Building2}
          />

          <SearchInput
            label="District"
            value={form.district}
            onChange={handleChange("district")}
            placeholder="Enter district"
            icon={Landmark}
          />

          <SearchInput
            label="State"
            value={form.state}
            onChange={handleChange("state")}
            placeholder="Enter state"
            icon={Globe}
          />
        </div>
      </FormSection>
    </>
  );
}
