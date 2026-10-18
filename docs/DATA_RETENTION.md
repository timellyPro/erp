# Data retention policy

Mirrors section 6 of the public Privacy Policy (`app/privacy-policy/page.tsx`). Change both together.
**The periods below are proposed defaults. Have a lawyer confirm them against the DPDP Act 2023 and Indian tax/education rules before relying on them.**

| Data | Retention | Then |
|---|---|---|
| Active school: students, staff, academics, attendance | While the school is a customer | See school closure |
| Fee and payment records | 8 years | Delete / de-identify |
| Payment audit log (`PaymentAuditLog`: who created, edited, deleted or refunded a payment) | 8 years, same as payments. Holds ids, amounts and references only, no personal details | Removed with the school; see docs/PAYMENT_AUDIT.md |
| Transfer certificates, academic history of leavers | School's statutory period | School decides; personal details removable on request |
| Application logs (Vercel log drain) | 30 days | Auto-expire in log provider |
| Error tracking (Sentry) | 90 days | Auto-expire in Sentry project settings |
| Database backups (Supabase) | 35 days | Auto-expire |
| Parent consent record (`User.privacyConsentVersion/At`) | Life of the account | Deleted with the user |

## School closure
1. School requests closure in writing (contact in `docs/SUPPORT.md`).
2. Provide a full export (fees backup workbook + student export) within 14 days.
3. After the school confirms, delete or de-identify within 90 days. Keep only payment receipts needed for accounting.
4. Record the date and who did it.

## Individual requests (parent / student)
Access, correction and deletion requests go to the school first, then to us. Respond within 30 days. When deleting a student, de-identify name/contact fields but keep amounts and dates so fee receipts stay valid.

## Consent
Parents accept the current policy in the portal (`ParentConsentGate`, `POST /api/consent`). Bump `PRIVACY_POLICY_VERSION` in `lib/consent.ts` after any material policy change to re-prompt everyone.

## Still manual
There is no automated purge job. Until one exists, run closure and deletion steps by hand. Also set the Sentry and log-drain retention in their dashboards to match the table.
