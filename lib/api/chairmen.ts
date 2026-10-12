import { apiGet, apiPost } from "./http";

export type ChairmanUser = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  createdAt: string;
};

export type ChairmanSchoolOption = {
  id: string;
  name: string;
  location?: string;
  users?: ChairmanUser[];
};

export type ChairmenListResponse = {
  message?: string;
  schools?: ChairmanSchoolOption[];
};

export function fetchChairmenSchools() {
  return apiGet<ChairmenListResponse>("/api/superadmin/chairmen", { cache: "no-store" });
}

export type CreateChairmanResponse = {
  message?: string;
};

export function createChairman(payload: {
  schoolId: string;
  name: string;
  email: string;
  password: string;
  mobile: string;
}) {
  return apiPost<CreateChairmanResponse>("/api/superadmin/chairmen/create", payload);
}
