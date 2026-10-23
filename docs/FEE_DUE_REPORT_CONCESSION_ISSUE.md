# Fee Due Report: concession amounts shown incorrectly

Date: 2026-10-23. School: Lotus English Medium High School. Report: Fee Due Report exported 23/10/2026.

## What was reported

The school entered concessions as round rupee figures. Some students show a different, smaller concession in the Fee Due Report, with paise.

## What we found

1. The system does not store the rupee amount that was entered. It stores only a percentage of the student's total yearly fee.
2. The report applies that stored percentage to a single fee head (for example Tuition 2nd Installment) instead of the whole-year fee.
3. A head is only part of the yearly fee, so the concession shown is much smaller than the amount entered, and it carries paise.

## How the entered amount can be worked out

Entered amount = stored percentage x total yearly fee.

This was checked against students who have an approved discount request holding the rupee amount. For those students the result matched the approval exactly, and the report's figure was the stored percentage multiplied by one head's amount.

## Confidence

- Confirmed: students with an approved discount request that records the rupee amount.
- Inferred only: students without one. The result is a round figure in most cases, which supports it, but it is not proof. One case did not come out round and is the least certain.

The school's receipts or concession register are the only sources that can confirm the inferred amounts.

## Other observations

- Some students show a concession of zero in the summary column but a non-zero concession in the detail columns.
- A few students' stored percentages do not reproduce the expected amount at all and need to be checked with the school.

## Proposed fix

1. Report: show the concession amount that was entered, or derive it from the whole-year fee, not from one head.
2. Data: after the school confirms the amounts, correct the affected students using the existing recalculation tool (dry run first). Payments are not touched.
3. Longer term: store the concession as a rupee amount so it cannot drift.

## Needed from the school

Confirmation of the concession amount for each affected student, from their records.
