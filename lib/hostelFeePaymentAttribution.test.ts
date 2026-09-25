import { rollupOrphanExtraFeeAllocations } from "@/lib/rollupOrphanExtraFeeAllocations";
import { labelForPaymentAllocation } from "@/lib/paymentFeeHeadLines";

/**
 * Regression: hostel payments must not display as "Extra Fee" and must roll onto
 * live hostel installment heads when the original extraFee row was deleted.
 */
describe("hostel fee payment attribution", () => {
  const liveFirstId = "live-hostel-1st";
  const liveSecondId = "live-hostel-2nd";
  const deletedFirstId = "deleted-hostel-1st";

  const heads = [
    {
      key: `EXTRA:${liveFirstId}`,
      extraFeeId: liveFirstId,
      label: "Hostel Fee - 1st Installment",
      snapshotDue: 35750,
    },
    {
      key: `EXTRA:${liveSecondId}`,
      extraFeeId: liveSecondId,
      label: "Hostel Fee - 2nd Installment",
      snapshotDue: 35750,
    },
  ];

  it("shows Hostel Fee (not Extra Fee) when extraFee row is deleted but componentName exists", () => {
    const label = labelForPaymentAllocation(
      {
        headType: "EXTRA_FEE",
        componentIndex: null,
        componentName: "Hostel Fee (1st Installment)",
        extraFeeId: deletedFirstId,
      },
      new Map()
    );
    expect(label).toBe("Hostel Fee - 1st Installment");
    expect(label).not.toBe("Extra Fee");
  });

  it("rolls deleted hostel installment payments onto the live 1st installment head for Fees Sheet paid column", () => {
    const extraFeesById = new Map([
      [deletedFirstId, { id: deletedFirstId, name: "Hostel Fee (1st Installment)" }],
      [liveFirstId, { id: liveFirstId, name: "Hostel Fee (1st Installment)" }],
      [liveSecondId, { id: liveSecondId, name: "Hostel Fee (2nd Installment)" }],
    ]);

    const net = new Map<string, number>([[`EXTRA:${deletedFirstId}`, 20000]]);
    rollupOrphanExtraFeeAllocations(net, heads, extraFeesById);

    expect(net.get(`EXTRA:${liveFirstId}`)).toBe(20000);
    expect(net.get(`EXTRA:${liveSecondId}`)).toBeUndefined();
    expect(net.has(`EXTRA:${deletedFirstId}`)).toBe(false);
  });

  it("handles full hostel installment payment from deleted id", () => {
    const extraFeesById = new Map([
      [deletedFirstId, { id: deletedFirstId, name: "Hostel Fee (1st Installment)" }],
      [liveFirstId, { id: liveFirstId, name: "Hostel Fee (1st Installment)" }],
      [liveSecondId, { id: liveSecondId, name: "Hostel Fee (2nd Installment)" }],
    ]);

    const net = new Map<string, number>([[`EXTRA:${deletedFirstId}`, 35750]]);
    rollupOrphanExtraFeeAllocations(net, heads, extraFeesById);

    expect(net.get(`EXTRA:${liveFirstId}`)).toBe(35750);
    expect(net.has(`EXTRA:${deletedFirstId}`)).toBe(false);
  });
});
