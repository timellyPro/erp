"use client";

import { useMemo, useState } from "react";
import TableLayout from "../../common/TableLayout";
import { Column } from "../../../types/superadmin";
import { useStudents, StudentWithRelations } from "@/app/_components/hooks/useStudents";

export default function StudentTable() {
  const { students, loading, error, refetch } = useStudents();
  const [selected, setSelected] = useState<StudentWithRelations | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(students.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = useMemo(
    () => students.slice((safePage - 1) * pageSize, safePage * pageSize),
    [students, safePage]
  );

  const columns: Column<StudentWithRelations>[] = [
    { header: "Admission No", accessor: "admissionNumber", align: "left" },
    {
      header: "Name",
      accessor: "user",
      align: "left",
      render: (row: StudentWithRelations) => row.user?.name ?? "-",
    },
    {
      header: "Class",
      accessor: "class",
      align: "left",
      render: (row: StudentWithRelations) => row.class ? `${row.class.name}${row.class.section ? " - " + row.class.section : ""}` : "-",
    },
    { header: "Phone", accessor: "phoneNo", align: "left" },
    { header: "DOB", accessor: "dob", align: "left" },
    {
      header: "Actions",
      accessor: "id",
      align: "right",
      render: (row: StudentWithRelations) => (
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setSelected(row)}
            className="px-3 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            View
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="p-4 bg-transparent">
        <h2 className="text-xl font-semibold text-white mb-4">Students</h2>

        <TableLayout
          columns={columns}
          data={pagedStudents}
          loading={loading}
          emptyText={error ? `Error: ${error}` : "No students found"}
          pagination={{
            page: safePage,
            totalPages,
            onChange: setPage,
          }}
        />
      </div>

      {selected && (
        <div className="p-4 bg-[#0f1724] rounded-2xl border border-white/10">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold text-white">{selected.user?.name ?? "Student"}</h3>
              <p className="text-sm text-white/70">Admission: {selected.admissionNumber}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(null)}
                className="px-3 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20"
              >
                Close
              </button>
              <button
                onClick={async () => { await refetch(); setSelected(null); }}
                className="px-3 py-1 rounded-lg bg-lime-400 text-black font-medium hover:bg-lime-300"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-white/70">Phone</p>
              <p className="text-white">{selected.phoneNo ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm text-white/70">Aadhaar</p>
              <p className="text-white">{selected.aadhaarNo ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm text-white/70">DOB</p>
              <p className="text-white">{selected.dob ?? "-"}</p>
            </div>
            <div className="md:col-span-3">
              <p className="text-sm text-white/70">Address</p>
              <p className="text-white">{selected.address ?? "-"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
