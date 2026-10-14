import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExamCard from "./ExamCard";
import type { TeacherExam } from "./examTypes";

const baseExam: TeacherExam = {
  id: "e1",
  name: "Unit Test 1",
  subject: "Maths",
  status: "UPCOMING",
  date: "2026-10-01",
  time: "10:00",
  duration: "60 min",
  class: { name: "8", section: "A" },
  syllabus: [{ completedPercent: 50 }, { completedPercent: 100 }],
};

function setup(exam: TeacherExam = baseExam) {
  const handlers = { onView: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn() };
  render(<ExamCard exam={exam} {...handlers} />);
  return handlers;
}

describe("ExamCard", () => {
  it("renders exam details and capitalised status", () => {
    setup();
    expect(screen.getByText("Unit Test 1")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText(/Class 8-A/)).toBeInTheDocument();
    expect(screen.getByText(/Maths/)).toBeInTheDocument();
    expect(screen.getByText("2026-10-01")).toBeInTheDocument();
  });

  it("averages syllabus coverage", () => {
    setup();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("shows 0% coverage with no syllabus", () => {
    setup({ ...baseExam, syllabus: [] });
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("clamps coverage to 100%", () => {
    setup({ ...baseExam, syllabus: [{ completedPercent: 250 }] });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("fires view and edit handlers", async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(screen.getByRole("button", { name: /view details/i }));
    await user.click(screen.getByRole("button", { name: /edit details/i }));
    expect(h.onView).toHaveBeenCalledTimes(1);
    expect(h.onEdit).toHaveBeenCalledTimes(1);
  });
});
