import { validateUserForm, type UserFormDataForValidation } from "./userFormValidation";

const valid: UserFormDataForValidation = {
  name: "Asha Rao",
  role: "TEACHER",
  password: "abcd1234",
  confirmPassword: "abcd1234",
  allowedFeatures: ["attendance"],
  subjects: ["Maths"],
};

describe("validateUserForm", () => {
  it("accepts a valid teacher in create mode", () => {
    expect(validateUserForm(valid, "create")).toEqual({});
  });

  describe("name", () => {
    it.each([
      ["", "Full name is required"],
      ["  ", "Full name is required"],
      ["A", "Name must be at least 2 characters"],
      ["x".repeat(101), "Name must be at most 100 characters"],
    ])("rejects %j", (name, msg) => {
      expect(validateUserForm({ ...valid, name }, "create").name).toBe(msg);
    });
  });

  describe("password", () => {
    it("is required on create", () => {
      const e = validateUserForm({ ...valid, password: "", confirmPassword: "" }, "create");
      expect(e.password).toBe("Password is required");
    });

    it("is optional on edit", () => {
      expect(validateUserForm({ ...valid, password: "", confirmPassword: "" }, "edit")).toEqual({});
    });

    it.each([
      ["short1", "Password must be at least 8 characters"],
      ["allletters", "Include at least one letter and one number"],
      ["12345678", "Include at least one letter and one number"],
      ["a1" + "x".repeat(127), "Password must be at most 128 characters"],
    ])("rejects %j on create", (password, msg) => {
      const e = validateUserForm({ ...valid, password, confirmPassword: password }, "create");
      expect(e.password).toBe(msg);
    });

    it("uses the 'New password' message on edit", () => {
      const e = validateUserForm({ ...valid, password: "a1", confirmPassword: "a1" }, "edit");
      expect(e.password).toBe("New password must be at least 8 characters");
    });

    it("flags a confirm mismatch", () => {
      const e = validateUserForm({ ...valid, confirmPassword: "different1" }, "create");
      expect(e.confirmPassword).toBe("Passwords do not match");
    });
  });

  it("requires at least one allowed feature", () => {
    expect(validateUserForm({ ...valid, allowedFeatures: [] }, "create").allowedFeatures).toMatch(/Select at least one module/);
  });

  describe("designation", () => {
    it("rejects 1 char and >120 chars, allows blank", () => {
      expect(validateUserForm({ ...valid, designation: "H" }, "create").designation).toMatch(/at least 2/);
      expect(validateUserForm({ ...valid, designation: "x".repeat(121) }, "create").designation).toMatch(/at most 120/);
      expect(validateUserForm({ ...valid, designation: "" }, "create").designation).toBeUndefined();
    });
  });

  describe("teacher-only fields", () => {
    it("requires subjects", () => {
      expect(validateUserForm({ ...valid, subjects: [] }, "create").subjects).toBe("Add at least one subject");
    });

    it("rejects blank or over-long subjects", () => {
      expect(validateUserForm({ ...valid, subjects: [" "] }, "create").subjects).toMatch(/1–80/);
      expect(validateUserForm({ ...valid, subjects: ["x".repeat(81)] }, "create").subjects).toMatch(/1–80/);
    });

    it("validates teacherId charset and length", () => {
      expect(validateUserForm({ ...valid, teacherId: "T 01" }, "create").teacherId).toMatch(/letters, numbers/);
      expect(validateUserForm({ ...valid, teacherId: "T".repeat(41) }, "create").teacherId).toMatch(/at most 40/);
      expect(validateUserForm({ ...valid, teacherId: "T-01_a" }, "create").teacherId).toBeUndefined();
    });

    it("validates mobile as exactly 10 digits ignoring punctuation", () => {
      expect(validateUserForm({ ...valid, mobile: "12345" }, "create").mobile).toBe("Phone must be exactly 10 digits");
      expect(validateUserForm({ ...valid, mobile: "98765-43210" }, "create").mobile).toBeUndefined();
    });

    it("validates joining date formats", () => {
      const ok = (d: string) => validateUserForm({ ...valid, joiningDate: d }, "create").joiningDate;
      expect(ok("15-08-2020")).toBeUndefined();
      expect(ok("2020-08-15")).toBeUndefined();
      expect(ok("")).toBeUndefined();
      expect(ok("31-02-2020")).toMatch(/valid date/);
      expect(ok("not a date")).toMatch(/valid date/);
    });

    it("validates address, qualification and experience lengths", () => {
      const e = validateUserForm(
        { ...valid, address: "abc", qualification: "B", experience: "x".repeat(81) },
        "create"
      );
      expect(e.address).toMatch(/at least 5/);
      expect(e.qualification).toMatch(/at least 2/);
      expect(e.experience).toMatch(/at most 80/);
    });
  });

  it("skips teacher-only rules for other roles", () => {
    const e = validateUserForm({ ...valid, role: "SCHOOLADMIN", subjects: [], mobile: "1" }, "create");
    expect(e).toEqual({});
  });
});
