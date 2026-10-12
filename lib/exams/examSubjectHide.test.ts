import {
  examTypeSubjectHideKey,
  globalHiddenSubjectNames,
  hideSubjectEverywhere,
  hideSubjectOnExamType,
  removedSubjectsByExam,
  restoreSubjectOnExamType,
  rewriteHiddenOnRename,
} from "./examSubjectHide";

describe("exam subject hide scope", () => {
  it("hides a subject on one exam type and leaves the catalog name", () => {
    const next = hideSubjectOnExamType(["SCIENCE"], "MID-TERM", "abacus");
    expect(next).toContain(examTypeSubjectHideKey("MID-TERM", "ABACUS"));
    expect(globalHiddenSubjectNames(next).has("ABACUS")).toBe(false);
    expect(globalHiddenSubjectNames(next).has("SCIENCE")).toBe(true);
    expect(removedSubjectsByExam(next)).toEqual({ "MID-TERM": ["ABACUS"] });
  });

  it("does not hide the same subject on another exam type", () => {
    const next = hideSubjectOnExamType([], "FINAL", "ART & CRAFT");
    const removed = removedSubjectsByExam(next);
    expect(removed.FINAL).toEqual(["ART & CRAFT"]);
    expect(removed["MID-TERM"]).toBeUndefined();
  });

  it("restores a subject on that exam type only", () => {
    const hidden = hideSubjectOnExamType(
      hideSubjectOnExamType([], "MID-TERM", "ABACUS"),
      "FINAL",
      "ABACUS"
    );
    const next = restoreSubjectOnExamType(hidden, "MID-TERM", "ABACUS");
    expect(removedSubjectsByExam(next)).toEqual({ FINAL: ["ABACUS"] });
  });

  it("hides a catalog subject everywhere and clears per-exam keys", () => {
    const hidden = hideSubjectOnExamType([], "TERM 1", "EVS");
    const next = hideSubjectEverywhere(hidden, "EVS");
    expect(globalHiddenSubjectNames(next).has("EVS")).toBe(true);
    expect(removedSubjectsByExam(next)).toEqual({});
  });

  it("moves a per-exam removal onto the new name when the catalog subject is renamed", () => {
    const hidden = hideSubjectOnExamType([], "WEEKLY TEST", "DRAWING");
    const next = rewriteHiddenOnRename(hidden, "DRAWING", "ART");
    expect(globalHiddenSubjectNames(next).has("DRAWING")).toBe(true);
    expect(removedSubjectsByExam(next)).toEqual({ "WEEKLY TEST": ["ART"] });
  });
});
