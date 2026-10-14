import { redistributeBaseMinusOneAllocations } from "./redistributeBaseMinusOneAllocations";

describe("redistributeBaseMinusOneAllocations", () => {
  const heads = [
    { key: "BASE:0", snapshotDue: 3000 },
    { key: "BASE:1", snapshotDue: 1000 },
  ];

  it("spreads the orphan amount proportionally to snapshot due and removes BASE:-1", () => {
    const paid = new Map([
      ["BASE:-1", 400],
      ["BASE:0", 100],
    ]);
    redistributeBaseMinusOneAllocations(paid, heads);
    expect(paid.has("BASE:-1")).toBe(false);
    expect(paid.get("BASE:0")).toBeCloseTo(100 + 300);
    expect(paid.get("BASE:1")).toBeCloseTo(100);
  });

  it("preserves the overall total", () => {
    const paid = new Map([["BASE:-1", 777]]);
    redistributeBaseMinusOneAllocations(paid, heads);
    const sum = [...paid.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(777);
  });

  it("just drops a zero orphan without touching other heads", () => {
    const paid = new Map([
      ["BASE:-1", 0],
      ["BASE:0", 50],
    ]);
    redistributeBaseMinusOneAllocations(paid, heads);
    expect([...paid.entries()]).toEqual([["BASE:0", 50]]);
  });

  it("does nothing when there is no orphan key", () => {
    const paid = new Map([["BASE:0", 50]]);
    redistributeBaseMinusOneAllocations(paid, heads);
    expect([...paid.entries()]).toEqual([["BASE:0", 50]]);
  });

  it("removes the orphan but distributes nothing when no head has a positive due", () => {
    const paid = new Map([["BASE:-1", 200]]);
    redistributeBaseMinusOneAllocations(paid, [
      { key: "BASE:0", snapshotDue: 0 },
      { key: "BASE:1", snapshotDue: -5 },
    ]);
    expect(paid.size).toBe(0);
  });

  it("handles a negative (refund) orphan proportionally", () => {
    const paid = new Map([["BASE:-1", -400]]);
    redistributeBaseMinusOneAllocations(paid, heads);
    expect(paid.get("BASE:0")).toBeCloseTo(-300);
    expect(paid.get("BASE:1")).toBeCloseTo(-100);
  });
});
