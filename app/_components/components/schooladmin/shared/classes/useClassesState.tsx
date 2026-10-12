import type { LucideIcon } from "lucide-react";
import { useClassesDataState } from "./useClassesDataState";
import { buildClassesTableColumns } from "./classesTableColumns";
import { ClassesActionButton } from "./ClassesActionButton";

export function useClassesState() {
  const data = useClassesDataState();
  const {
    activeAction,
    activeRowId,
    panelMode,
    setActiveRowId,
    setPanelMode,
    closePanel,
  } = data;

  const tableColumns = buildClassesTableColumns({
    activeRowId,
    panelMode,
    setActiveRowId,
    setPanelMode,
    closePanel,
  });

  const renderButton = (
    type: "class" | "section" | "assign" | "csv" | "report",
    Icon: LucideIcon,
    label: string,
    onClick: () => void,
    primary?: boolean,
    disabled?: boolean
  ) => (
    <ClassesActionButton
      type={type}
      Icon={Icon}
      label={label}
      onClick={onClick}
      primary={primary}
      disabled={disabled}
      activeAction={activeAction}
    />
  );

  return {
    ...data,
    tableColumns,
    renderButton,
  };
}
