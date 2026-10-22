import {
  getBreakdownMemCached,
  getShellCached,
  invalidateSchoolFeeReadCaches,
  invalidateStudentFeeReadCaches,
  setBreakdownMemCached,
  setShellCached,
} from "@/lib/fees/studentFeeReadCache";
import { getStudentDetailsCoreCached, setStudentDetailsCoreCached } from "@/lib/students/studentDetailsCoreCache";

const mockBump = jest.fn().mockResolvedValue(1);
jest.mock("@/lib/fees/feeDataVersion", () => ({
  scheduleFeeDataVersionBump: (...args: unknown[]) => mockBump(...args),
  getSchoolFeeDataVersion: jest.fn(),
}));
jest.mock("@/lib/cache/tenantCache", () => ({ invalidateTenant: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/db/tenantContext", () => ({ tenantDb: {} }));
jest.mock("@/lib/fees/feeListServerCache", () => ({ invalidateFeeListServerCaches: jest.fn() }));

const value = { finalFee: 1 } as never;

describe("server fee caches are tied to the school's fee-data version", () => {
  it("a breakdown copy built at version 4 is a hit at 4 and a miss at 5", () => {
    setBreakdownMemCached("s1:stu1:fast", value, undefined, 4);
    expect(getBreakdownMemCached("s1:stu1:fast", 4)).toBe(value);
    expect(getBreakdownMemCached("s1:stu1:fast", 5)).toBeNull();
  });

  it("an unknown version (database unreadable) falls back to the old time-based behaviour", () => {
    setBreakdownMemCached("s1:stu2:fast", value, undefined, 4);
    expect(getBreakdownMemCached("s1:stu2:fast", null)).toBe(value);
    expect(getBreakdownMemCached("s1:stu2:fast")).toBe(value);
  });

  it("the profile shell and the core bundle are version-checked the same way", () => {
    setShellCached("s1:stu1:shell", { a: 1 }, undefined, 2);
    expect(getShellCached("s1:stu1:shell", 2)).toEqual({ a: 1 });
    expect(getShellCached("s1:stu1:shell", 3)).toBeNull();

    setStudentDetailsCoreCached("s1:stu1:core", { shell: {}, feeBreakdown: null } as never, 2);
    expect(getStudentDetailsCoreCached("s1:stu1:core", 2)).not.toBeNull();
    expect(getStudentDetailsCoreCached("s1:stu1:core", 3)).toBeNull();
  });

  it("changing a student's fee bumps the school's counter, so other processes and browsers see it", () => {
    mockBump.mockClear();
    invalidateStudentFeeReadCaches({ studentId: "stu1", schoolId: "s1" });
    expect(mockBump).toHaveBeenCalledWith("s1");
  });

  it("changing a class fee structure bumps it too; a call with no school does not", () => {
    mockBump.mockClear();
    invalidateSchoolFeeReadCaches("s1");
    expect(mockBump).toHaveBeenCalledWith("s1");
    mockBump.mockClear();
    invalidateStudentFeeReadCaches({ studentId: "stu1" });
    expect(mockBump).not.toHaveBeenCalled();
  });
});
