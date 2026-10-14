import { Trash2 } from "lucide-react";
import SelectInput from "../../../../common/SelectInput";
import PrimaryButton from "../../../../common/PrimaryButton";
import type { Class } from "../../types";

export function FeeStructureEditor({
  editingId,
  classes,
  structureClassId,
  setStructureClassId,
  components,
  setComponents,
  saving,
  deleting,
  onSave,
  onCancel,
  onDelete,
}: {
  editingId: string;
  classes: Class[];
  structureClassId: string;
  setStructureClassId: (v: string) => void;
  components: Array<{ name: string; amount: number }>;
  setComponents: (next: Array<{ name: string; amount: number }>) => void;
  saving: boolean;
  deleting: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border-t border-white/10 pt-4 space-y-4">
      <SelectInput
        label="Class"
        value={structureClassId}
        onChange={setStructureClassId}
        disabled={editingId !== "new"}
        options={classes.map((c) => ({
          label: `${c.name}${c.section ? `-${c.section}` : ""}`,
          value: c.id,
        }))}
      />
      <div>
        <p className="text-sm font-medium mb-2">Fee Components</p>
        {components.map((c, i) => (
          <div key={i} className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={c.name}
              onChange={(e) => {
                const n = [...components];
                n[i] = { ...n[i], name: e.target.value };
                setComponents(n);
              }}
              placeholder="Component name"
              className="flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={c.amount}
              onChange={(e) => {
                const n = [...components];
                n[i] = { ...n[i], amount: Number(e.target.value) };
                setComponents(n);
              }}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm sm:w-24"
            />
            <button
              type="button"
              onClick={() => setComponents(components.filter((_, idx) => idx !== i))}
              className="p-2 rounded-lg hover:bg-red-500/20 text-red-400"
              title="Remove component"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setComponents([...components, { name: "", amount: 0 }])}
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          + Add component
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <PrimaryButton
          title={saving ? "Saving..." : "Save Structure"}
          loading={saving}
          onClick={onSave}
        />
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-white/20"
        >
          Cancel
        </button>
        {editingId !== "new" && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving || deleting}
            className="px-4 py-2 rounded-xl border border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {deleting ? "Deleting..." : "Delete Structure"}
          </button>
        )}
      </div>
    </div>
  );
}
