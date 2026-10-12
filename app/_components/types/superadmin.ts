

export type School = {
  id: string;
  name: string;
  studentCount: number;
  admin: {
    name: string | null;
    email: string | null;
    mobile: string | null;
  } | null;
};

export type Column<T> = {
  header: string;
  accessor?: keyof T;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => React.ReactNode;

  hideOnMobile?: boolean;
};
