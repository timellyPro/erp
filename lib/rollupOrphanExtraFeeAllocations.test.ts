import {
  rollupOrphanExtraFeeAllocations,
  spillInstallmentOverpay,
} from "@/lib/rollupOrphanExtraFeeAllocations";

describe("rollupOrphanExtraFeeAllocations", () => {
  const firstId = "mess-1st";
  const secondId = "mess-2nd";
  const lumpId = "mess-lump";

  const heads = [
    {
      key: `EXTRA:${firstId}`,
      extraFeeId: firstId,
      label: "Mess Fee (1st Installment)",
      snapshotDue: 15400,
    },
    {
      key: `EXTRA:${secondId}`,
      extraFeeId: secondId,
      label: "Mess Fee (2nd Installment)",
      snapshotDue: 15400,
    },
  ];

  const extraFeesById = new Map([
    [firstId, { id: firstId, name: "Mess Fee (1st Installment)" }],
    [secondId, { id: secondId, name: "Mess Fee (2nd Installment)" }],
    [lumpId, { id: lumpId, name: "Mess Fee" }],
  ]);

  it("rolls lump Mess Fee payment onto 1st installment then 2nd", () => {
    const net = new Map<string, number>([[`EXTRA:${lumpId}`, 15400]]);
    rollupOrphanExtraFeeAllocations(net, heads, extraFeesById);
    expect(net.get(`EXTRA:${firstId}`)).toBe(15400);
    expect(net.get(`EXTRA:${secondId}`)).toBeUndefined();
    expect(net.has(`EXTRA:${lumpId}`)).toBe(false);
  });

  it("splits lump overpay across 1st then 2nd", () => {
    const net = new Map<string, number>([[`EXTRA:${lumpId}`, 20000]]);
    rollupOrphanExtraFeeAllocations(net, heads, extraFeesById);
    expect(net.get(`EXTRA:${firstId}`)).toBe(15400);
    expect(net.get(`EXTRA:${secondId}`)).toBe(4600);
    expect(net.has(`EXTRA:${lumpId}`)).toBe(false);
  });

  it("rolls orphan 1st installment id onto matching live 1st head", () => {
    const legacyFirst = "old-mess-1st";
    const fees = new Map(extraFeesById);
    fees.set(legacyFirst, { id: legacyFirst, name: "Mess Fee - 1st Installment" });
    const net = new Map<string, number>([[`EXTRA:${legacyFirst}`, 15400]]);
    rollupOrphanExtraFeeAllocations(net, heads, fees);
    expect(net.get(`EXTRA:${firstId}`)).toBe(15400);
    expect(net.has(`EXTRA:${legacyFirst}`)).toBe(false);
  });

  it("moves hostel 1st-installment receipts above the installment amount onto the 2nd", () => {
    const firstId = "hostel-1st";
    const secondId = "hostel-2nd";
    const hostelHeads = [
      {
        key: `EXTRA:${firstId}`,
        extraFeeId: firstId,
        label: "Hostel Fee (1st Installment)",
        snapshotDue: 35750,
      },
      {
        key: `EXTRA:${secondId}`,
        extraFeeId: secondId,
        label: "Hostel Fee (2nd Installment)",
        snapshotDue: 35750,
      },
    ];
    const fees = new Map([
      [firstId, { id: firstId, name: "Hostel Fee (1st Installment)" }],
      [secondId, { id: secondId, name: "Hostel Fee (2nd Installment)" }],
    ]);
    const net = new Map<string, number>([
      [`EXTRA:${firstId}`, 25000 + 35750],
      [`EXTRA:tuition-1st`, 23650],
    ]);
    spillInstallmentOverpay(net, hostelHeads, fees);

    expect(net.get(`EXTRA:${firstId}`)).toBe(35750);
    expect(net.get(`EXTRA:${secondId}`)).toBe(25000);
    const shownPaid = 35750 + 25000 + 23650;
    expect(shownPaid).toBe(84400);
  });

  it("leaves orphan untouched when name cannot be resolved", () => {
    const ghost = "deleted-unknown";
    const net = new Map<string, number>([[`EXTRA:${ghost}`, 5000]]);
    rollupOrphanExtraFeeAllocations(net, heads, extraFeesById);
    expect(net.get(`EXTRA:${ghost}`)).toBe(5000);
  });
});
