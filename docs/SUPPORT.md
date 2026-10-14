# Support and status

- **Support email:** timelly26@gmail.com (shown on `/support` and in the Privacy Policy). Change it in `lib/support.ts` when you have a shared inbox or WhatsApp number.
- **Support page:** `/support`
- **Status page:** `/status` shows live database/config health from `/api/health`. For incident history and subscriber alerts, create a free BetterStack or UptimeRobot status page pointed at `https://<domain>/api/health`, then set `NEXT_PUBLIC_STATUS_PAGE_URL` to its URL; `/status` will link to it.
- **Suggested response targets:** acknowledge within 4 business hours; login or fee-payment outages the same day.
