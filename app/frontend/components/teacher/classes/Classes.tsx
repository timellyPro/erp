"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import TimellyLoader from "../../common/TimellyLoader";
import HeaderActionButton from "../../common/HeaderActionButton";
import { useTeacherClasses } from "./hooks/useTeacherClasses";
import { useClassMetrics } from "./hooks/useClassMetrics";
import ClassCards from "./components/ClassCards";
import StudentsSection from "./components/StudentsSection";
import PageHeader from "../../common/PageHeader";
import AssignSectionPanel from "../../schooladmin/classes-panels/AssignSectionPanel";

const getClassLabel = (name?: string | null, section?: string | null) =>
  name ? `${name}${section ? `-${section}` : ""}` : "—";

export default function TeacherClasses() {
  const { classes, students, loading, error, reload } = useTeacherClasses();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [showAssignSection, setShowAssignSection] = useState(false);

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? classes[0] ?? null,
    [classes, selectedClassId]
  );

  const classStudents = useMemo(() => {
    if (!selectedClass?.id) return [];
    return students.filter((s) => s.class?.id === selectedClass.id);
  }, [students, selectedClass?.id]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return classStudents;
    const q = search.toLowerCase();
    return classStudents.filter((s) => {
      const name = s.user?.name?.toLowerCase() ?? "";
      const roll = s.rollNo?.toLowerCase() ?? "";
      const admission = s.admissionNumber?.toLowerCase() ?? "";
      return name.includes(q) || roll.includes(q) || admission.includes(q);
    });
  }, [classStudents, search]);

  const metrics = useClassMetrics(selectedClass?.id ?? null, classStudents);

  const studentsWithMetrics = useMemo(
    () =>
      filteredStudents.map((student) => ({
        ...student,
        metrics: metrics.byStudentId[student.id] ?? {
          attendancePct: null,
          avgMarksPct: null,
          grade: null,
        },
      })),
    [filteredStudents, metrics.byStudentId]
  );

  const totalClasses = classes.length;
  const totalStudents = students.length;
  const activeStudents = classStudents.length;

  return (
    <div className="min-h-screen text-white sm:lg:space-y-6">
      <PageHeader
        title="My Classes"
        subtitle="Manage your classes and view student information."
        rightSlot={
          <HeaderActionButton
            icon={ArrowRightLeft}
            label={showAssignSection ? "Hide Assign Section" : "Assign Section"}
            primary={showAssignSection}
            onClick={() => setShowAssignSection((prev) => !prev)}
          />
        }
      />

      {showAssignSection && (
        <AssignSectionPanel
          onCancel={() => setShowAssignSection(false)}
          onSuccess={() => {
            void reload();
          }}
        />
      )}

      {loading && classes.length === 0 ? (
        <TimellyLoader title="Loading classes" steps={["Classes", "Students", "Roster"]} />
      ) : error && classes.length === 0 ? (
        <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">
          {error}
        </div>
      ) : (
        <>
          <section className="space-y-4">
            {/* <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold">Classes</h3>
                <p className="text-white/60 text-sm">Tap a class to view students</p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-white/50">
                <span className="w-2.5 h-2.5 rounded-full bg-lime-400" />
                Selected
              </div>
            </div> */}

            <ClassCards
              classes={classes}
              selectedId={selectedClass?.id ?? null}
              onSelect={(id) => {
                setSelectedClassId(id);
                setExpandedStudentId(null);
              }}
            />
          </section>

          <StudentsSection
            classTitle={getClassLabel(selectedClass?.name, selectedClass?.section)}
            students={studentsWithMetrics}
            search={search}
            onSearch={setSearch}
            expandedId={expandedStudentId}
            onToggleExpanded={(id) =>
              setExpandedStudentId((prev) => (prev === id ? null : id))
            }
          />
          {metrics.loading && (
            <div className="text-sm text-white/60 flex items-center gap-2">
              <TimellyLoader compact bare title="Loading metrics" steps={["Attendance", "Marks"]} />
            </div>
          )}
          {metrics.error && (
            <div className="text-sm text-red-200">{metrics.error}</div>
          )}
        </>
      )}
    </div>
  );
}
