import { Shield } from "lucide-react";
import AllowedFeatureToggle from "../AllowedFeatureToggle";
import type { UserFormErrors } from "../userFormValidation";
import { AVAILABLE_FEATURES_FOR_TEACHERS } from "./userFormHelpers";

export function AccessControlPanel({
  allowedFeatures,
  fieldErrors,
  onToggleFeature,
  onToggleAll,
}: {
  allowedFeatures: string[];
  fieldErrors: UserFormErrors;
  onToggleFeature: (feature: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected = allowedFeatures.length === AVAILABLE_FEATURES_FOR_TEACHERS.length;
  return (
    <div
      className="col-span-1 bg-black/20 bg-gradient-to-b from-white/10/5
     to-white/0 rounded-2xl p-5 flex flex-col gap-4
      bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 h-full"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
            <Shield className="lucide lucide-shield w-5 h-5 text-lime-400" /> Access Control{" "}
            <span className="text-red-400 text-sm font-normal">*</span>
          </h3>
          <p className="text-[11px] text-white/50">
            Choose which modules this user can access.
          </p>
          {fieldErrors.allowedFeatures ? (
            <p className="text-xs text-red-400 mt-2" role="alert">
              {fieldErrors.allowedFeatures}
            </p>
          ) : null}
        </div>
        <span className="text-[11px] font-medium text-lime-300 px-3 py-1 bg-lime-400/10 text-lime-400
         text-xs font-bold rounded-full border border-lime-400/20">
          {allowedFeatures.length} Active
        </span>
      </div>

      <AllowedFeatureToggle label="Select All" checked={allSelected} onChange={onToggleAll} />

      <div className="lg:col-span-1" />

      <div className="space-y-4 overflow-y-auto pr-2 no-scrollbar">
        {AVAILABLE_FEATURES_FOR_TEACHERS.map((feature) => (
          <AllowedFeatureToggle
            key={feature.key}
            label={feature.label}
            description={feature.description}
            checked={allowedFeatures.includes(feature.key)}
            onChange={() => onToggleFeature(feature.key)}
          />
        ))}
      </div>
    </div>
  );
}
