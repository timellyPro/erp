import { Eye, Pencil, Trash2 } from "lucide-react";
import type { SchoolAdminClassRow } from "@/lib/school/loadSchoolAdminFastTabs";

export function buildClassesTableColumns({
  activeRowId,
  panelMode,
  setActiveRowId,
  setPanelMode,
  closePanel,
}: {
  activeRowId: string | null;
  panelMode: "view" | "edit" | "delete" | null;
  setActiveRowId: (id: string) => void;
  setPanelMode: (mode: "view" | "edit" | "delete" | null) => void;
  closePanel: () => void;
}) {
  return [
    {
      header: "CLASS NAME",
      render: (row: SchoolAdminClassRow) => (
        <span className="text-white font-medium">{row.name}</span>
      ),
    },
    {
      header: "SECTION",
      render: (row: SchoolAdminClassRow) => (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
          {row.section}
        </span>
      ),
    },
    {
      header: "STUDENTS",
      align: "center" as const,
      render: (row: SchoolAdminClassRow) => (
        <span className="text-white font-semibold">{row.students}</span>
      ),
    },
    {
      header: "CLASS TEACHER",
      render: (row: SchoolAdminClassRow) => (
        <div>
          <div className="text-white font-medium">{row.teacher}</div>
          <div className="text-xs text-white/40">{row.subject}</div>
        </div>
      ),
    },
    {
      header: "ACTIONS",
      align: "center" as const,
      render: (row: SchoolAdminClassRow) => (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "view") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("view");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="View"
          >
            <Eye size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "edit") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("edit");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-green-400 hover:bg-white/10 transition-colors cursor-pointer"
            title="Edit"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeRowId === row.id && panelMode === "delete") {
                closePanel();
                return;
              }
              setActiveRowId(row.id);
              setPanelMode("delete");
            }}
            className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];
}
