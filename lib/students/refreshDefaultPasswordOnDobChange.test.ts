/**
 * @jest-environment node
 */
import bcrypt from "bcryptjs";
import { refreshDefaultPasswordOnDobChange } from "@/lib/students/refreshDefaultPasswordOnDobChange";
import {
  passwordCandidatesFromDob,
  resolveStudentPasswordState,
} from "@/lib/students/studentDefaultPassword";

const OLD = new Date("2012-05-03T06:30:00.000Z"); // noon in India, 3 May
const NEW = new Date("2012-05-04T06:30:00.000Z");

function makeDb(hash: string | null) {
  const state = { hash };
  return {
    state,
    user: {
      findUnique: jest.fn(async () => ({ password: state.hash })),
      update: jest.fn(async ({ data }: { data: { password: string } }) => {
        state.hash = data.password;
      }),
    },
  };
}

describe("refreshDefaultPasswordOnDobChange", () => {
  it("moves a still-default password to the new DOB", async () => {
    const db = makeDb(await bcrypt.hash("20120503", 4));
    expect(await refreshDefaultPasswordOnDobChange(db, { userId: "u", oldDob: OLD, newDob: NEW })).toBe("UPDATED");
    const after = await resolveStudentPasswordState(NEW, db.state.hash);
    expect(after.state).toBe("DEFAULT");
    expect(after.password).toBe("20120504");
  });
  it("leaves a password the student chose alone", async () => {
    const db = makeDb(await bcrypt.hash("my-own-secret", 4));
    expect(await refreshDefaultPasswordOnDobChange(db, { userId: "u", oldDob: OLD, newDob: NEW })).toBe("KEPT");
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("does nothing when the calendar date did not change or there is no login", async () => {
    const same = makeDb(await bcrypt.hash("20120503", 4));
    expect(
      await refreshDefaultPasswordOnDobChange(same, { userId: "u", oldDob: OLD, newDob: new Date("2012-05-03T10:00:00.000Z") })
    ).toBe("UNCHANGED");
    const none = makeDb(null);
    expect(await refreshDefaultPasswordOnDobChange(none, { userId: "u", oldDob: OLD, newDob: NEW })).toBe("UNCHANGED");
    expect(same.user.update).not.toHaveBeenCalled();
  });
});

describe("resolveStudentPasswordState", () => {
  it("recognises the default made from the date the app shows (India), not just UTC", async () => {
    // Saved as IST midnight: UTC says 2 May, the screens say 3 May.
    const istMidnight = new Date("2012-05-02T18:30:00.000Z");
    expect(passwordCandidatesFromDob(istMidnight)).toContain("20120503");
    const r = await resolveStudentPasswordState(istMidnight, await bcrypt.hash("20120503", 4));
    expect(r).toEqual({ password: "20120503", verified: true, state: "DEFAULT" });
  });
  it("explains each way a password cannot be shown", async () => {
    const hash = await bcrypt.hash("something-else", 4);
    expect((await resolveStudentPasswordState(OLD, hash)).state).toBe("CUSTOM");
    expect((await resolveStudentPasswordState(OLD, null)).state).toBe("NO_LOGIN");
    expect((await resolveStudentPasswordState(null, hash)).state).toBe("NO_DOB");
  });
});
