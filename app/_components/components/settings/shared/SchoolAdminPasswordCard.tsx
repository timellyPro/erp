import { Lock } from "lucide-react";
import SearchInput from "../../common/SearchInput";
import { CardTitle, Field } from "../SettingsPrimitives";
import { CARD_BODY_CLASS, CARD_CLASS, CARD_HEADER_CLASS, type CommonSettingsProps } from "../portalSettingsTypes";

export function SchoolAdminPasswordCard({
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
