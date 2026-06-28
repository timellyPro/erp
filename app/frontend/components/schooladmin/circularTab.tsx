"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../common/PageHeader";

import CircularFilters from "./circularTab/CircularFilters";
import CircularList from "./circularTab/CircularList";
import CircularForm from "./circularTab/CircularForm";
import { CircularRow } from "./circularTab/types";
import { Plus, Scroll, X } from "lucide-react";
import TimellyLoader from "../common/TimellyLoader";
import {
  invalidateCirculars,
  loadCirculars,
  peekCirculars,
} from "@/lib/loadSchoolAdminFastTabs";

export default function SchoolAdminCircularsTab() {
  const [circulars, setCirculars] = useState<CircularRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [importance, setImportance] = useState("All Importance");
  const [recipient, setRecipient] = useState("all");
  const [classId, setClassId] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchCirculars = useCallback(async (revalidate = false) => {
    if (!revalidate) {
      const cached = peekCirculars(recipient, classId);
      if (cached) {
        setCirculars(cached as CircularRow[]);
        setLoading(false);
        void fetchCirculars(true);
        return;
      }
    }

    try {
      setLoading(circulars.length === 0);
      const rows = await loadCirculars(recipient, classId, { revalidate });
      setCirculars(rows as CircularRow[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [circulars.length, recipient, classId]);

  useEffect(() => {
    fetchCirculars();
  }, [fetchCirculars]);

  const filteredCirculars = useMemo(() => {
    return circulars.filter((c) => {
      if (search && !c.subject.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (importance !== "All Importance" && c.importanceLevel !== importance) {
        return false;
      }
      return true;
    });
  }, [circulars, search, importance]);

  return (
    <div className="min-h-screen text-white w-full min-w-0 overflow-x-hidden pb-20 lg:pb-0">
      {/* HEADER */}
      <PageHeader
        compact
        className=""
        icon={<Scroll className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />}
        title="Circulars & Notices"
        subtitle="Create and manage school-wide circulars"
        transparent={true}
        rightSlot={
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full bg-lime-400 text-black font-semibold hover:bg-lime-300 transition w-full sm:w-auto text-sm sm:text-base shrink-0"
          >
            {showForm ? (
              <>
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Cancel</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Create Circular</span>
              </>
            )}
          </button>
        }
      />

      {/* CONTENT */}
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 mt-3 sm:mt-6 space-y-4 sm:space-y-6 pb-6 sm:pb-8">
        {/* FORM (pushes content down) */}
        {showForm && (
          <div className="w-full">
            <CircularForm
              onClose={() => setShowForm(false)}
              onSuccess={async () => {
                setShowForm(false);
                invalidateCirculars();
                await fetchCirculars(true);
              }}
            />
          </div>
        )}

        {/* FILTER CARD */}
        <div className="w-full min-w-0 px-2 sm:px-0">
          <CircularFilters
            search={search}
            onSearch={setSearch}
            importance={importance}
            onImportance={setImportance}
            recipient={recipient}
            onRecipient={setRecipient}
            classId={classId}
            onClassId={setClassId}
          />
        </div>

        {/* LIST / LOADER */}
        {loading && circulars.length === 0 ? (
          <TimellyLoader
            compact
            title="Loading circulars"
            steps={["Notices", "Recipients", "Attachments"]}
          />
        ) : (
          <>
            {loading && <div className="text-xs text-white/50 px-2">Refreshing circulars...</div>}
            <CircularList circulars={filteredCirculars} />
          </>
        )}
      </div>
    </div>
  );
}
