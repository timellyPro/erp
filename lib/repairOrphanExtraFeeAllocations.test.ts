import {
  matchLiveExtraFeeIdForOrphanName,
  resolveOrphanAllocationFeeName,
} from "@/lib/repairOrphanExtraFeeAllocations";

describe("repairOrphanExtraFeeAllocations", () => {
  const liveHostel = [
    {
      id: "live-hostel-1",
      name: "Hostel Fee (1st Installment)",
      targetType: "SCHOOL",
      targetStudentId: null,
    },
    {
      id: "live-hostel-2",
      name: "Hostel Fee (2nd Installment)",
      targetType: "SCHOOL",
      targetStudentId: null,
    },
  ];

  it("maps deleted 1st installment id name onto live school hostel 1st row", () => {
    expect(
      matchLiveExtraFeeIdForOrphanName("Hostel Fee (1st Installment)", liveHostel, "student-1")
    ).toBe("live-hostel-1");
  });

  it("maps partial hostel payment name onto 1st installment when amount differs", () => {
    expect(
      matchLiveExtraFeeIdForOrphanName("Hostel Fee (1st Installment)", liveHostel, "student-1")
    ).toBe("live-hostel-1");
  });

  it("uses stored componentName before inferring hostel from amount", () => {
    expect(
      resolveOrphanAllocationFeeName(
        { componentName: "Hostel Fee (1st Installment)", allocatedAmount: 20000 },
        {
          hosteller: true,
          hostelFees: [{ name: "Hostel Fee (1st Installment)", amount: 35750 }],
          messFees: [],
        }
      )
    ).toBe("Hostel Fee (1st Installment)");
  });

  it("infers hostel fee name for hosteller when snapshot missing", () => {
    expect(
      resolveOrphanAllocationFeeName(
        { componentName: null, allocatedAmount: 35750 },
        {
          hosteller: true,
          hostelFees: [{ name: "Hostel Fee (1st Installment)", amount: 35750 }],
          messFees: [],
        }
      )
    ).toBe("Hostel Fee (1st Installment)");
  });
});
