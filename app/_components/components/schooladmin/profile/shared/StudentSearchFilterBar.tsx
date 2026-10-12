import SelectInput from "../../../common/SelectInput";
import { StudentSearchAutocomplete } from "../components/StudentSearchAutocomplete";
import type { StudentOption } from "./types";

type SelectOption = { label: string; value: string };

export function StudentSearchFilterBar({
  students,
  searchQuery,
  onSearchChange,
  onSelectStudent,
  selectedId,
  onSelectedIdChange,
  filterClass,
  onFilterClassChange,
  filterSection,
  onFilterSectionChange,
  filterStatus,
  onFilterStatusChange,
  statusOptions,
  classOptions,
  sectionOptions,
  studentSelectOptions,
}: {
  students: StudentOption[];
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onSelectStudent: (student: StudentOption) => void;
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  filterClass: string;
  onFilterClassChange: (v: string) => void;
  filterSection: string;
  onFilterSectionChange: (v: string) => void;
  filterStatus: "all" | "active" | "inactive";
  onFilterStatusChange: (v: "all" | "active" | "inactive") => void;
  statusOptions: SelectOption[];
  classOptions: SelectOption[];
  sectionOptions: SelectOption[];
  studentSelectOptions: SelectOption[];
}) {
  return (
    <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-6 overflow-visible relative z-20 isolate min-w-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6 overflow-visible">
        <div className="relative z-20 min-w-0">
          <StudentSearchAutocomplete
            students={students}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            onSelectStudent={onSelectStudent}
            selectedId={selectedId}
            classFilter={filterClass}
            sectionFilter={filterSection}
            statusFilter={filterStatus}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Filter by Status</label>
          <SelectInput
            value={filterStatus}
            onChange={(v) => onFilterStatusChange(v as "all" | "active" | "inactive")}
            options={statusOptions}
            bgColor="black"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Filter by Class</label>
          <SelectInput
            value={filterClass}
            onChange={onFilterClassChange}
            options={classOptions}
            bgColor="black"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Filter by Section</label>
          <SelectInput
            value={filterSection}
            onChange={onFilterSectionChange}
            options={sectionOptions}
            bgColor="black"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Students List</label>
          <SelectInput
            value={selectedId ?? ""}
            onChange={(value) => onSelectedIdChange(value || null)}
            options={[{ label: "Select student", value: "" }, ...studentSelectOptions]}
            bgColor="black"
          />
        </div>
      </div>
    </div>
  );
}
