'use client';

interface HomeworkHeaderProps {
  studentName: string;
}

export default function HomeworkHeader({ studentName }: HomeworkHeaderProps) {
  return (
    <section className="somu rounded-2xl p-7">
      <h1 className="text-2xl font-semibold">
        Homework & Assignments
      </h1>
      <p className="mt-1 text-sm text-white/70">
        Track and submit {studentName}'s homework
      </p>
    </section>
  );
}
