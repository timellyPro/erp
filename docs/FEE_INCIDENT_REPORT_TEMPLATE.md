# Fee incident report template

Copy this for each fee/export/transaction problem. Fill every line you can; "unknown"
is fine, blank is not. Do **not** paste real student passwords, Aadhaar numbers or
phone numbers. Use the internal student ID.

| Field | Value |
|---|---|
| Date and time seen (with timezone) | |
| School name and school ID | |
| Reported by (role) | |
| Student internal ID (not name) | |
| Class / section | |
| Fee period / academic year | |
| Area | Fee card / Extra fee / Export / Transaction / Receipt / Credentials / Due report |
| Page or button used | |
| Steps to reproduce (numbered) | |
| Expected result (with amounts) | |
| Actual result (with amounts) | |
| Does a page refresh change it? | Yes / No |
| Does waiting 5 minutes and retrying change it? | Yes / No |
| Browser and device | |
| Screenshot / export file attached | Yes / No |

## For payment or receipt problems also record

| Field | Value |
|---|---|
| Receipt number | |
| Payment reference / UTR / order ID | |
| Amount and date on the receipt | |
| Payment mode | Cash / Cheque / UPI / Gateway |
| Collected by (staff) | |
| Gateway status shown in the gateway dashboard | |

**Before any repair:** check the audit log and gateway reference first. Never recreate
a payment by hand. Run `npx tsx scripts/reconcile-school-fees.ts --dry-run --school-id=<id>`
and attach the output.
