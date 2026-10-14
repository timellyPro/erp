export type FeesBackupEmailTemplateInput = {
  recipient: string;
  schoolNames: string[];
  filenames: string[];
  generatedAt: Date;
};

function formatIst(date: Date): string {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function buildFeesBackupEmailContent(input: FeesBackupEmailTemplateInput): {
  subject: string;
  text: string;
  html: string;
} {
  const dateLabel = input.generatedAt.toISOString().slice(0, 10);
  const istLabel = formatIst(input.generatedAt);
  const schoolList = input.schoolNames.join(", ");
  const count = input.schoolNames.length;

  const subject =
    count === 1
      ? `Fees backup – ${input.schoolNames[0]} – ${dateLabel}`
      : `Fees backup – ${count} schools – ${dateLabel}`;

  const text = [
    "Timelly ERP – Fees Backup",
    "",
    `Hello,`,
    "",
    `Please find the attached fees backup Excel file(s).`,
    "",
    `Schools: ${schoolList}`,
    `Generated (IST): ${istLabel}`,
    `Recipient: ${input.recipient}`,
    "",
    "Attachments:",
    ...input.filenames.map((f) => ` - ${f}`),
    "",
    "This is an automated message from Timelly Super Admin.",
    "Do not reply to this email.",
  ].join("\n");

  const schoolRows = input.schoolNames
    .map(
      (name, i) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e8e8e8;color:#222;">${escapeHtml(name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e8e8e8;color:#555;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(input.filenames[i] || "—")}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#0f172a;padding:22px 24px;">
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;font-weight:600;">Timelly ERP</div>
              <div style="margin-top:6px;font-size:20px;font-weight:700;color:#f8fafc;">Fees Backup Report</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155;">
                Hello,
              </p>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#334155;">
                Your automated fees backup Excel file${count === 1 ? " is" : "s are"} attached to this email.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:18px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Generated</div>
                    <div style="margin-top:4px;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(istLabel)} IST</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 16px 14px;">
                    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Sent to</div>
                    <div style="margin-top:4px;font-size:14px;color:#0f172a;">${escapeHtml(input.recipient)}</div>
                  </td>
                </tr>
              </table>
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:8px;">Schools &amp; files</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <tr style="background:#f1f5f9;">
                  <th align="left" style="padding:10px 12px;font-size:12px;color:#475569;font-weight:600;">School</th>
                  <th align="left" style="padding:10px 12px;font-size:12px;color:#475569;font-weight:600;">Attachment</th>
                </tr>
                ${schoolRows}
              </table>
              <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#64748b;">
                Open the attached <strong>.xlsx</strong> file(s) in Excel or Google Sheets. This message was sent from Super Admin backup automation.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px 20px;border-top:1px solid #e2e8f0;background:#fafafa;">
              <div style="font-size:12px;color:#94a3b8;">© Timelly · Automated notification · Do not reply</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
