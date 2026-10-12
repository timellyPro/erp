import {
  CIRCULAR_IMPORTANCE_HIGH,
  CIRCULAR_IMPORTANCE_MEDIUM,
  CIRCULAR_IMPORTANCE_LOW,
} from "@/app/_components/constants/colors";

export function getImportanceBorderColor(level: string): string {
  switch (level) {
    case "High":
      return CIRCULAR_IMPORTANCE_HIGH;
    case "Medium":
      return CIRCULAR_IMPORTANCE_MEDIUM;
    case "Low":
      return CIRCULAR_IMPORTANCE_LOW;
    default:
      return CIRCULAR_IMPORTANCE_MEDIUM;
  }
}

export function getInitial(name: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name[0].toUpperCase();
}
