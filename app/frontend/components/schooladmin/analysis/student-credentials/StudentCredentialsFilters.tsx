"use client";

import { Search } from "lucide-react";
import SelectInput from "../../../common/SelectInput";
import SearchInput from "../../../common/SearchInput";

type Option = { label: string; value: string };

type Props = {
  classOptions: Option[];
  sectionOptions: Option[];
  selectedClass: string;
  selectedSection: string;
  searchQuery: string;
  classesLoading: boolean;
  onClassChange: (value: string) => void;
  onSectionChange: (value: string) => void;
  onSearchChange: (value: string) => void;
};

export default function StudentCredentialsFilters({
  classOptions,
  sectionOptions,
  selectedClass,
  selectedSection,
  searchQuery,
  classesLoading,
  onClassChange,
  onSectionChange,
  onSearchChange,
}: Props) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      <SelectInput
        label="Class"
        value={selectedClass}
        onChange={onClassChange}
        options={classOptions}
        bgColor="white"
        disabled={classesLoading}
      />
      <SelectInput
        label="Section"
        value={selectedSection}
        onChange={onSectionChange}
        options={sectionOptions}
        bgColor="white"
        disabled={classesLoading}
      />
      <SearchInput
        label="Search"
        placeholder="Search name, email, admission no…"
        value={searchQuery}
        onChange={onSearchChange}
        icon={Search}
        variant="glass"
      />
    </div>
  );
}
