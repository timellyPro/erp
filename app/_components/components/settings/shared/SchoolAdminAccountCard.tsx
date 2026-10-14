import { Mail, MapPin, Phone, User } from "lucide-react";
import SearchInput from "../../common/SearchInput";
import { CardTitle, Field } from "../SettingsPrimitives";
import { CARD_BODY_CLASS, CARD_CLASS, CARD_HEADER_CLASS, type CommonSettingsProps } from "../portalSettingsTypes";

export function SchoolAdminAccountCard({
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
