# Fee data version (why a corrected fee shows up straight away)

A student's fee details are cached to keep pages fast: in the server's memory and in each browser (tab
memory and tab storage, which survives a refresh). Before this, a change made **outside** the app (a
repair script, a manual correction) cleared none of those copies, so an old figure could stay on screen
for 5 minutes (server), 30 minutes (browser details) or 24 hours (browser fee breakdown).

## How it works now

- `SchoolSettings.feeDataVersion` is a per-school counter. `invalidateStudentFeeReadCaches` and
  `invalidateSchoolFeeReadCaches` (called after every payment, fee edit and repair) add one to it
  (`lib/fees/feeDataVersion.ts`, `scheduleFeeDataVersionBump`).
- **Server copies** (breakdown, profile shell, core bundle) remember the counter they were built at. A request
  reads the counter first (memoised for 2 s per process) and treats a copy built at another number as a miss.
  Read the counter **before** the data it stamps, so a change that commits in between just causes a rebuild.
- **Browser copies**: `ensureFeeVersionFresh()` (`lib/fees/feeVersionClient.ts`) asks `GET /api/fees/version`
  at most once every 5 s before a cached copy is served. If the number differs from the one this tab last
  saw (kept in tab storage), every saved copy is dropped through the flush callbacks the cache modules
  register. No stored number means unknown age, so copies are dropped once.
- The browser fee-breakdown copy now lives 15 minutes (session) / 10 minutes (memory) as a backstop, not 24 hours.

## Failure behaviour

Anything that goes wrong leaves the old behaviour in place: an unreadable counter is `null` ("unknown, skip the
check"), a failed browser check keeps the copies, a failed bump is swallowed. The check can make a page fresher;
it cannot make it fail.

## For scripts

Repair scripts that call `invalidateStudentFeeReadCaches` bump the counter automatically. A script that exits
right after should `await flushPendingFeeDataVersionBumps()` so the bump is not cut off.

## Tests and migration

`FEE_DATA_VERSION=off` (set in `jest.setup.js`) stops the default database client from being used in unit
tests. Migration `20261022160000_fee_data_version` adds `"feeDataVersion" INTEGER NOT NULL DEFAULT 0`
(idempotent).
