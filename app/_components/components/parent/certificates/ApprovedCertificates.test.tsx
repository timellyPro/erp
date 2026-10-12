import { render, screen } from "@testing-library/react";
import ApprovedCertificates from "@/app/_components/components/parent/certificates/ApprovedCertificates";

const makeCert = (overrides = {}) => ({
  id: "abc123",
  title: "Test Cert",
  description: null,
  issuedDate: "2026-03-01T00:00:00.000Z",
  certificateUrl: "https://example.com/cert.pdf",
  student: { user: { name: "Student Name" } },
  ...overrides,
});

describe("ApprovedCertificates", () => {
  it("shows a message when there are no certificates", () => {
    render(<ApprovedCertificates certificates={[]} />);
    expect(screen.getByText(/No certificates issued yet/i)).toBeInTheDocument();
  });

  it("renders download link when url present", () => {
    render(<ApprovedCertificates certificates={[makeCert()]} />);
    // overlay button may be hidden; check small icon always-visible link
    const link = screen.getByLabelText(/download certificate/i);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/cert.pdf");
    expect(link).toHaveAttribute("download");
  });

  it("disables link when url is null", () => {
    render(<ApprovedCertificates certificates={[makeCert({ certificateUrl: null })]} />);
    // small download icon should not be present
    expect(screen.queryByLabelText(/download certificate/i)).not.toBeInTheDocument();
    // the card should show No PDF Available text in overlay; we can open overlay by simulating hover but simpler: assert that button exists in DOM
    expect(screen.getByText(/No PDF Available/i)).toBeInTheDocument();
  });
});