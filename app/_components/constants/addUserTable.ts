export interface IUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  designation?: string;
  allowedFeatures?: string[];
   photoUrl?: string | null;
}

export interface TableColumn {
  header: string;
  key?: string;
  align?: "left" | "center" | "right";
  render?: (row: IUser) => React.ReactNode;
  width?: string;
}

// This will be populated dynamically in AddUser component
export type AddUserTableColumnsGenerator = (
  onEdit: (user: IUser) => void,
  onDelete: (user: IUser) => void
) => TableColumn[];
