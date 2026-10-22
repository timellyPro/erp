import {
  bumpSchoolFeeDataVersion,
  flushPendingFeeDataVersionBumps,
  getSchoolFeeDataVersion,
  resetFeeDataVersionMemo,
  scheduleFeeDataVersionBump,
} from "@/lib/fees/feeDataVersion";

jest.mock("@/lib/db/tenantContext", () => ({ tenantDb: {} }));

function fakeDb(start: number | null = 0) {
  let row: { feeDataVersion: number } | null = start === null ? null : { feeDataVersion: start };
  return {
    schoolSettings: {
      findUnique: jest.fn(async () => row),
      upsert: jest.fn(
        async (args: { create: { feeDataVersion: number }; update: { feeDataVersion: { increment: number } } }) => {
          row = row
            ? { feeDataVersion: row.feeDataVersion + args.update.feeDataVersion.increment }
            : { feeDataVersion: args.create.feeDataVersion };
          return row;
        }
      ),
    },
  };
}

describe("fee data version", () => {
  beforeEach(() => resetFeeDataVersionMemo());

  it("reads 0 for a school with no settings row", async () => {
    expect(await getSchoolFeeDataVersion("s1", fakeDb(null))).toBe(0);
  });

  it("every bump moves the number up by one, and creates the row when the school has none", async () => {
    const db = fakeDb(null);
    expect(await bumpSchoolFeeDataVersion("s1", db)).toBe(1);
    expect(await bumpSchoolFeeDataVersion("s1", db)).toBe(2);
    expect(await getSchoolFeeDataVersion("s1", db)).toBe(2);
  });

  it("returns null (unknown, skip the check) when the database fails, and never throws", async () => {
    const db = {
      schoolSettings: {
        findUnique: jest.fn().mockRejectedValue(new Error("down")),
        upsert: jest.fn().mockRejectedValue(new Error("down")),
      },
    };
    expect(await getSchoolFeeDataVersion("s1", db as never)).toBeNull();
    expect(await bumpSchoolFeeDataVersion("s1", db as never)).toBeNull();
  });

  it("a scheduled bump outside a request still finishes, and a script can wait for it", async () => {
    // The default client is off in tests, so schedule with it off: the task resolves to null and flush returns.
    const task = scheduleFeeDataVersionBump("s1");
    await flushPendingFeeDataVersionBumps();
    expect(await task).toBeNull();
    await expect(flushPendingFeeDataVersionBumps()).resolves.toBeUndefined();
  });

  it("does nothing without a school id, and is switched off for the default client in tests", async () => {
    expect(await getSchoolFeeDataVersion(null)).toBeNull();
    expect(await bumpSchoolFeeDataVersion(undefined)).toBeNull();
    expect(await getSchoolFeeDataVersion("s1")).toBeNull(); // FEE_DATA_VERSION=off from jest.setup.js
  });
});
