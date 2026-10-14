import {
  STATUS_MAP,
  formatDate,
  classNameDisplay,
  getCertificateTypeLabel,
} from "./certificatesTabHelpers";
import type { CertificateRequestListItem } from "../../Certificates";

describe("STATUS_MAP", () => {
  it("maps the backend statuses to their tab keys", () => {
    expect(STATUS_MAP.PENDING).toBe("pending");
    expect(STATUS_MAP.APPROVED).toBe("approved");
    expect(STATUS_MAP.REJECTED).toBe("rejected");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as day-month-year", () => {
    expect(formatDate("2026-03-05T00:00:00.000Z")).toBe("5 Mar 2026");
  });

  it("returns the original string for an unparseable date", () => {
    expect(formatDate("not-a-date")).toBe("Invalid Date");
  });
});

describe("classNameDisplay", () => {
  const makeRequest = (
    classInfo: { name: string; section?: string | null } | null
  ): CertificateRequestListItem =>
    ({
      student: { class: classInfo },
    }) as unknown as CertificateRequestListItem;

  it("returns an em dash when the student has no class", () => {
    expect(classNameDisplay(makeRequest(null))).toBe("—");
  });

  it("combines name and section when both present", () => {
    expect(classNameDisplay(makeRequest({ name: "5", section: "A" }))).toBe("5-A");
  });

  it("returns just the name when there is no section", () => {
    expect(classNameDisplay(makeRequest({ name: "5", section: null }))).toBe("5");
  });
});

describe("getCertificateTypeLabel", () => {
  it("returns a generic label when the type is missing", () => {
    expect(getCertificateTypeLabel(null)).toBe("Certificate");
    expect(getCertificateTypeLabel(undefined)).toBe("Certificate");
    expect(getCertificateTypeLabel("")).toBe("Certificate");
  });

  it("maps known certificate type codes to their display labels", () => {
    expect(getCertificateTypeLabel("TRANSFER")).toBe("Transfer Certificate (TC)");
    expect(getCertificateTypeLabel("BONAFIDE")).toBe("Bonafide Certificate");
  });

  it("matches case-insensitively", () => {
    expect(getCertificateTypeLabel("transfer")).toBe("Transfer Certificate (TC)");
  });

  it("falls back to the raw type string for an unknown type", () => {
    expect(getCertificateTypeLabel("CUSTOM_TYPE")).toBe("CUSTOM_TYPE");
  });
});
