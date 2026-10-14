import { BookOpen } from "lucide-react";
import TimellyLoader from "../../../../common/TimellyLoader";

interface ClassItem {
  id: string;
  name: string;
  section: string | null;
}

export function ExamDetailsFormFields({
  examTitle,
  onExamTitleChange,
  examTypeOptions,
  classLoading,
  classes,
  selectedClassId,
  onSelectedClassIdChange,
  subject,
  onSubjectChange,
  subjectOptions,
  examDate,
  onExamDateChange,
  examStatus,
  onExamStatusChange,
  startTime,
  onStartTimeChange,
  durationMin,
  onDurationMinChange,
}: {
  examTitle: string;
  onExamTitleChange: (v: string) => void;
  examTypeOptions: string[];
  classLoading: boolean;
  classes: ClassItem[];
  selectedClassId: string;
  onSelectedClassIdChange: (v: string) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  subjectOptions: string[];
  examDate: string;
  onExamDateChange: (v: string) => void;
  examStatus: "UPCOMING" | "COMPLETED";
  onExamStatusChange: (v: "UPCOMING" | "COMPLETED") => void;
  startTime: string;
  onStartTimeChange: (v: string) => void;
  durationMin: number;
  onDurationMinChange: (v: number) => void;
}) {
  return (
    <div className="somu rounded-[1rem] p-8 flex flex-col gap-8 h-fit ">
      <h2 className="text-lg font-bold text-white flex items-center gap-2"><BookOpen className="text-lime-400"/>Exam Details</h2>

      <div className="space-y-3">
        {/* Exam Title */}
        <div className="flex flex-col gap-2">
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Exam Title</label>
          <input
            value={examTitle}
            onChange={(e) => onExamTitleChange(e.target.value)}
            placeholder="Term 1 Mathematics Finals"
            list="teacher-exam-title-options"
            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none
            focus:border-lime-400/50 text-white placeholder-gray-500 transition-all text-sm"
          />
          <datalist id="teacher-exam-title-options">
            {examTypeOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        {/* Class and Subject */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Class</label>
            {classLoading ? (
              <div className="bg-[#2a213a]/50 border border-white/5 rounded-2xl p-2 text-white/40 text-sm">
                <TimellyLoader compact bare title="Loading classes" steps={["Roster"]} />
              </div>
            ) : (
              <select
                value={selectedClassId}
                onChange={(e) => onSelectedClassIdChange(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none
                 focus:border-lime-400/50 text-white placeholder-gray-500 transition-all text-sm"
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.section ? `-${c.section}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Subject</label>
            <input
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Mathematics"
              list="teacher-exam-subject-options"
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none
              focus:border-lime-400/50 text-white placeholder-gray-500 transition-all text-sm"
            />
            <datalist id="teacher-exam-subject-options">
              {subjectOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Date and Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Date</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => onExamDateChange(e.target.value)}
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50
               text-white placeholder-gray-500 transition-all text-sm [color-scheme:dark]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Status</label>
            <select
              value={examStatus}
              onChange={(e) => onExamStatusChange(e.target.value as "UPCOMING" | "COMPLETED")}
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl
              focus:outline-none focus:border-lime-400/50
              text-white placeholder-gray-500 transition-all text-sm appearance-none cursor-pointer"
            >
              <option value="UPCOMING">Upcoming</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        {/* Time and Duration */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => onStartTimeChange(e.target.value)}
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl
              focus:outline-none focus:border-lime-400/50 text-white
               placeholder-gray-500 transition-all text-sm [color-scheme:dark]"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Duration</label>
            <div className="flex gap-2 flex-wrap items-center">
              <input
                type="number"
                value={durationMin}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    onDurationMinChange(0);
                    return;
                  }
                  const n = parseInt(raw, 10);
                  if (!Number.isNaN(n) && n >= 0) {
                    onDurationMinChange(n);
                  }
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n) || n < 0) onDurationMinChange(60);
                }}
                placeholder="60"
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:outline-none
                focus:border-lime-400/50 text-white placeholder-gray-500 transition-all text-sm"
              />
              <span className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">min</span>
              <div className="flex gap-1">
                {[60, 90, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onDurationMinChange(m);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase ${durationMin === m ? "bg-[#b4ff39] text-black" : "bg-white/5 text-white/60 hover:text-white/80"
                      }`}
                  >
                    {m === 60 ? "1h" : m === 90 ? "1.5h" : m === 120 ? "2h" : "3h"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
