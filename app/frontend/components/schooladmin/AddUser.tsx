"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Pencil, Search, Trash2 } from "lucide-react";
import { useDebounce } from "@/app/frontend/hooks/useDebounce";
import PageHeader from "../common/PageHeader";
import DataTable from "../common/TableLayout";
import PageTabs from "../schooladmin/schooladmincomponents/PageHeaderTabs";
import SearchInput from "../common/SearchInput";
import UserForm from "./schooladmincomponents/UserForm";
import DeleteConfirmation from "../common/DeleteConfirmation";
import UserBadge from "./schooladmincomponents/UserBadge";
import RoleBadge from "./schooladmincomponents/RoleBadge";
import StatusBadge from "./schooladmincomponents/StatusBadge";
import UsersMobileList from "./schooladmincomponents/UsersMobileList";
import InlinePagination from "./schooladmincomponents/InlinePagination";
import { IUser } from "@/app/frontend/constants/addUserTable";
import {
  fetchUserListPage,
  invalidateAddUserPageCache,
  listCacheKey,
  peekUserListPage,
  warmAddUserPage,
} from "@/lib/fetchAddUserPage";

export {
  validateUserForm,
  type UserFormErrors,
} from "./schooladmincomponents/userFormValidation";

const PAGE_SIZE = 10;
const LIST_ROLE = "TEACHER";

/** User create/edit UI lives in `UserForm`; field rules are in `userFormValidation.ts`. */
export default function AddUser() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const schoolId = session?.user?.schoolId ?? null;

  const parentTab = searchParams.get("tab");
  const activeTab =
    searchParams.get("view") ?? (parentTab === "add-user" ? "add" : "all");
  const editingUserId = searchParams.get("userId");

  const [users, setUsers] = useState<IUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    userId: string;
    userName: string;
  }>({
    isOpen: false,
    userId: "",
    userName: "",
  });

  const listKey = schoolId
    ? listCacheKey(schoolId, page, PAGE_SIZE, debouncedSearch, LIST_ROLE)
    : "";

  const editingUserFromList = useMemo(
    () => users.find((u) => u.id === editingUserId) ?? null,
    [users, editingUserId]
  );

  useEffect(() => {
    if (schoolId) warmAddUserPage(schoolId);
  }, [schoolId]);

  useEffect(() => {
    if (activeTab !== "all") return;
    setPage(1);
  }, [debouncedSearch, activeTab]);

  useEffect(() => {
    if (activeTab !== "all" || !schoolId) return;

    const cached = peekUserListPage(listKey);
    if (cached) {
      setUsers(cached.users);
      setTotalCount(cached.total);
      const tp = Math.max(1, Math.ceil(cached.total / PAGE_SIZE));
      setTotalPages(tp);
      setPage((prev) => Math.min(prev, tp));
      setLoading(false);
    } else {
      setLoading(true);
    }

    const controller = new AbortController();
    setRevalidating(Boolean(cached));

    void fetchUserListPage(schoolId, {
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch,
      role: LIST_ROLE,
      revalidate: !cached,
      signal: controller.signal,
    })
      .then((data) => {
        setUsers(data.users);
        setTotalCount(data.total);
        const tp = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        setTotalPages(tp);
        setPage((prev) => Math.min(prev, tp));
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to fetch users:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRevalidating(false);
        }
      });

    return () => controller.abort();
  }, [page, debouncedSearch, activeTab, schoolId, listKey]);

  const handleEdit = (user: IUser) => {
    router.push(`?tab=add-user&view=add&userId=${user.id}`);
  };

  const handleDeleteClick = (user: IUser) => {
    setDeleteModal({
      isOpen: true,
      userId: user.id,
      userName: user.name,
    });
  };

  const handleDeleteConfirm = async () => {
    const deletedId = deleteModal.userId;
    const prevUsers = users;
    setUsers((rows) => rows.filter((u) => u.id !== deletedId));
    setTotalCount((n) => Math.max(0, n - 1));

    try {
      const res = await fetch(`/api/user/${deletedId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete user");
      }

      if (schoolId) invalidateAddUserPageCache(schoolId);
      setDeleteModal({ isOpen: false, userId: "", userName: "" });
    } catch (error) {
      setUsers(prevUsers);
      setTotalCount((n) => n + 1);
      throw error;
    }
  };

  const handleFormSuccess = useCallback(() => {
    if (schoolId) invalidateAddUserPageCache(schoolId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "add-user");
    params.set("view", "all");
    params.delete("userId");
    router.push(`?${params.toString()}`);
  }, [router, schoolId, searchParams]);

  const getLastActive = (row: IUser) => {
    if (!row.createdAt) return "N/A";
    const date = new Date(row.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Now";
    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString();
  };

  const tableColumns: any[] = [
    {
      header: "USER",
      render: (row: IUser) => (
        <UserBadge name={row.name} email={row.email} imageUrl={(row as any).photoUrl} />
      ),
    },
    {
      header: "ROLE",
      render: (row: IUser) => <RoleBadge role={row.role} />,
    },
    {
      header: "STATUS",
      render: () => <StatusBadge status="active" />,
    },
    {
      header: "LAST ACTIVE",
      render: (row: IUser) => (
        <span className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
          {getLastActive(row)}
        </span>
      ),
    },
    {
      header: "ACTIONS",
      align: "center" as const,
      render: (row: IUser) => (
        <div className="flex justify-center gap-2">
          {row.role !== "SCHOOLADMIN" && (
            <motion.button
              whileHover={{ scale: row.role === "TEACHER" ? 1.1 : 1 }}
              whileTap={{ scale: row.role === "TEACHER" ? 0.95 : 1 }}
              disabled={row.role !== "TEACHER"}
              onClick={() => row.role === "TEACHER" && handleEdit(row)}
              className={`p-2 rounded-lg transition-colors ${
                row.role === "TEACHER"
                  ? "hover:bg-white/10 text-gray-400 hover:text-white"
                  : "bg-white/5 text-gray-500/70 cursor-not-allowed"
              }`}
              title={
                row.role === "TEACHER"
                  ? "Edit user"
                  : "Editing is currently available for teachers only"
              }
            >
              <Pencil size={18} />
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleDeleteClick(row)}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
            title="Delete user"
          >
            <Trash2 size={18} />
          </motion.button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Create new users, manage access, and view user directory."
        rightSlot={
          <PageTabs
            tabs={[
              { label: "All Users", value: "all" },
              { label: "Add User", value: "add" },
            ]}
            queryKey="view"
            defaultWhenMissing="add"
          />
        }
      />

      {activeTab === "all" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex-1 min-w-0">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search users by name or email..."
                  variant="glass"
                  icon={Search}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/60 md:justify-end">
                <span>Showing teachers only</span>
                {revalidating ? <span className="text-cyan-300/80">Updating…</span> : null}
                {totalCount > 0 ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                    {totalCount} total
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="md:hidden space-y-3">
            <UsersMobileList
              users={users}
              loading={loading && users.length === 0}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
              getLastActive={getLastActive}
            />
            <InlinePagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>

          <div className="hidden md:block">
            <DataTable
              columns={tableColumns}
              data={users}
              loading={loading && users.length === 0}
              showMobile={false}
              pagination={{
                page,
                totalPages,
                onChange: setPage,
              }}
            />
          </div>
        </motion.div>
      )}

      {activeTab === "add" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <UserForm
            mode={editingUserId ? "edit" : "create"}
            schoolId={schoolId}
            listShellUser={editingUserFromList}
            onSuccess={handleFormSuccess}
          />
        </motion.div>
      )}

      <DeleteConfirmation
        isOpen={deleteModal.isOpen}
        userName={deleteModal.userName}
        onConfirm={handleDeleteConfirm}
        onCancel={() =>
          setDeleteModal({ isOpen: false, userId: "", userName: "" })
        }
      />
    </>
  );
}
