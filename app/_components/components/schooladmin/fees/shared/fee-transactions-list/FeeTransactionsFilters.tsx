import { Search } from "lucide-react";
import SelectInput from "../../../../common/SelectInput";
import SearchInput from "../../../../common/SearchInput";
import type { Class } from "../../types";

export function FeeTransactionsFilters({
  studentSearch,
  setStudentSearch,
  selectedCollectorUserId,
  setSelectedCollectorUserId,
  collectorOptions,
  selectedYear,
  setSelectedYear,
  yearOptions,
  selectedClassId,
  setSelectedClassId,
  classes,
  selectedSection,
  setSelectedSection,
  sectionLoading,
  sectionOptions,
}: {
  studentSearch: string;
  setStudentSearch: (v: string) => void;
  selectedCollectorUserId: string;
  setSelectedCollectorUserId: (v: string) => void;
  collectorOptions: Array<{ label: string; value: string }>;
  selectedYear: string;
  setSelectedYear: (v: string) => void;
  yearOptions: Array<{ label: string; value: string }>;
  selectedClassId: string;
  setSelectedClassId: (v: string) => void;
  classes: Class[];
  selectedSection: string;
  setSelectedSection: (v: string) => void;
  sectionLoading: boolean;
  sectionOptions: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="mb-5 w-full rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <div>
          <SearchInput
            label="Search Student"
            value={studentSearch}
            onChange={setStudentSearch}
            icon={Search}
            showSearchIcon
            placeholder="Name or ID..."
            variant="glass"
          />
        </div>
        <div>
          <SelectInput
            label="Collected by"
            value={selectedCollectorUserId}
            onChange={setSelectedCollectorUserId}
            options={collectorOptions}
          />
        </div>
        <div>
          <SelectInput
            label="Year"
            value={selectedYear}
            onChange={setSelectedYear}
            options={yearOptions}
          />
        </div>
        <div>
          <SelectInput
            label="Class"
            value={selectedClassId}
            onChange={setSelectedClassId}
            options={[
              { label: "All Classes", value: "" },
              ...classes.map((c) => ({
                label: c.name,
                value: c.id,
              })),
            ]}
          />
        </div>
        <div>
          <SelectInput
            label="Section"
            value={selectedSection}
            onChange={setSelectedSection}
            disabled={!selectedClassId || sectionLoading}
            options={
              selectedClassId
                ? sectionOptions
                : [{ label: "All Sections", value: "" }]
            }
          />
        </div>
      </div>
    </div>
  );
}
