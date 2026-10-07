import {
  buildStudentFullNameFromApplication,
  resolveStudentDisplayName,
  splitFullNameToApplicationParts,
} from "@/lib/resolveStudentDisplayName";

describe("resolveStudentDisplayName", () => {
  it("prefers user.name over application name", () => {
    expect(
      resolveStudentDisplayName({
        user: { name: "Updated Student Name" },
        application: { firstName: "Old", middleName: null, lastName: "Application Name" },
      })
    ).toBe("Updated Student Name");
  });

  it("falls back to application when user.name is missing", () => {
    expect(
      resolveStudentDisplayName({
        user: { name: "" },
        application: { firstName: "THATVIK", middleName: "REDDY", lastName: "G" },
      })
    ).toBe("THATVIK REDDY G");
  });

  it("falls back to user.name when application is missing", () => {
    expect(
      resolveStudentDisplayName({
        user: { name: "Login Name Only" },
        application: null,
      })
    ).toBe("Login Name Only");
  });
});

describe("splitFullNameToApplicationParts", () => {
  it("splits three-part names into first, middle, last", () => {
    expect(splitFullNameToApplicationParts("THATVIK REDDY G")).toEqual({
      firstName: "THATVIK",
      middleName: "REDDY",
      lastName: "G",
    });
  });

  it("uses single token for both first and last", () => {
    expect(splitFullNameToApplicationParts("ARUN")).toEqual({
      firstName: "ARUN",
      middleName: null,
      lastName: "ARUN",
    });
  });

  it("round-trips through application full name builder", () => {
    const parts = splitFullNameToApplicationParts("Priya Lakshmi Rao");
    expect(buildStudentFullNameFromApplication(parts)).toBe("Priya Lakshmi Rao");
  });
});
