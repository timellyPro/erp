import { FEATURES, FEATURE_IDS, getDefaultFeaturesForRole } from "@/lib/features";

describe("lib/features", () => {
  it("FEATURES has id, label, description for each", () => {
    expect(FEATURES.length).toBeGreaterThan(0);
    FEATURES.forEach((f) => {
      expect(f).toHaveProperty("id");
      expect(f).toHaveProperty("label");
      expect(f).toHaveProperty("description");
      expect(typeof f.id).toBe("string");
      expect(typeof f.label).toBe("string");
      expect(typeof f.description).toBe("string");
    });
  });

  it("FEATURE_IDS is list of ids from FEATURES", () => {
    expect(FEATURE_IDS).toHaveLength(FEATURES.length);
    expect(FEATURE_IDS).toEqual(FEATURES.map((f) => f.id));
  });

  describe("getDefaultFeaturesForRole", () => {
    it("returns all feature ids for SCHOOLADMIN", () => {
      const result = getDefaultFeaturesForRole("SCHOOLADMIN");
      expect(result).toEqual([...FEATURE_IDS]);
    });

    it("returns subset for TEACHER that includes dashboard, homework, exams, events", () => {
      const result = getDefaultFeaturesForRole("TEACHER");
      expect(result).toContain("dashboard");
      expect(result).toContain("homework");
      expect(result).toContain("marks-entry");
      expect(result).toContain("attendance-mark");
      expect(result).toContain("events");
      expect(result).toContain("exams");
      expect(result.length).toBeLessThanOrEqual(FEATURE_IDS.length);
    });
  });

  it("FEATURES includes all tenant features: attendance, homework, workshops/events, marks, certificates, etc", () => {
    const ids = FEATURES.map((f) => f.id);
    expect(ids).toContain("dashboard");
    expect(ids).toContain("attendance-mark");
    expect(ids).toContain("attendance-view");
    expect(ids).toContain("homework");
    expect(ids).toContain("events");
    expect(ids).toContain("exams");
    expect(ids).toContain("marks-entry");
    expect(ids).toContain("marks-view");
    expect(ids).toContain("certificates");
    expect(ids).toContain("communication");
    expect(ids).toContain("leaves");
    expect(ids).toContain("student-leaves");
    expect(ids).toContain("classes");
    expect(ids).toContain("students");
    expect(ids).toContain("teachers");
    expect(ids).toContain("school");
    expect(ids).toContain("payments");
    expect(ids).toContain("tc");
    expect(ids).toContain("student-details");
    expect(ids).toContain("newsfeed");
  });
});
