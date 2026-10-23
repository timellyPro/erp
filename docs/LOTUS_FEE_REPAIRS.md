# Lotus fee repairs (live data changes)

Each entry is a change made to a stored fee record after the school confirmed the figures in writing.
The stored-fee tool keeps no history, so the before/after is recorded here. Payments are never touched.

## 2026-10-22 — LS1279, B Faiza Uzlifa (Class 6-B, day scholar)

Why: the saved total had no tuition (Rs. 39,600), so the Fee Records list showed Rs. 4,400 due instead of the true balance.
School's confirmation: tuition applies; the concession on Tuition 2nd Installment is Rs. 10,000 (not Rs. 2,250).

| | Before | After |
|---|---|---|
| Total fee | 48,400 | 88,000 |
| Final fee | 48,400 | 78,000 |
| Paid | 44,000 | 44,000 (unchanged) |
| Remaining | 4,400 | 34,000 |

Command: `scripts/recalculate-student-fees.ts --school-id=<lotus> --student-ids=<id> --concession=10000 --apply`

## 2026-10-22 — LS323, Rithvik V (Class 6-B, day scholar)

Why: the saved total had no tuition (Rs. 39,600 = 2 x 19,800); the balance showed Rs. 0 only because the missing tuition and the amount paid cancelled out.
School's confirmation: tuition applies; concession Rs. 5,000 on Tuition 2nd Installment is correct; nothing pending.

| | Before | After |
|---|---|---|
| Total fee | 48,400 | 88,000 |
| Final fee | 43,400 | 83,000 |
| Paid | 83,000 | 83,000 (unchanged) |
| Remaining | 0 | 0 |

Note: when the tool ran, the stored record already read 88,000 / 83,000 (the app realigns saved totals when a profile is opened), so the tool wrote nothing for this student.

## 2026-10-22 — LS1469, Shaik Mohammed Nouman (Class 6-B, hosteller)

Why: the saved total had no tuition (Rs. 39,600).
School's confirmation: tuition applies; concession Rs. 15,000 in total; balance Rs. 40,550. The Rs. 15,000 approval request was left PENDING (the record carries the concession already).

| | Before | After |
|---|---|---|
| Total fee | 71,500 | 111,100 |
| Final fee | 71,500 | 96,100 |
| Paid | 55,550 | 55,550 (unchanged) |
| Remaining | 15,950 | 40,550 |

Command: `scripts/recalculate-student-fees.ts --school-id=<lotus> --student-ids=<id> --concession=15000 --apply`

## 2026-10-22 — LS33, Vanshika G S (Class 9-C, day scholar)

Why: the 8 July payment of Rs. 14,000 was allocated Rs. 26,550 (Rs. 12,550 to Mess Fee 1st Installment + Rs. 14,000 to Last Year 2025-2026 Fee Due), so Mess 1st looked fully paid. The allocation row was created 7 Oct 2026, the day of the Rs. 20,000 payment; cause not yet known.
School confirmation (accountant, 22.10.2026): only Rs. 4,500 was paid toward mess; remove the Rs. 12,550.

Change: deleted allocation cmth052st000rikfhpkrufvyo (Mess Fee - 1st Installment, Rs. 12,550). The payment itself and the stored totals are unchanged (total 105,300, paid 44,000, remaining 61,300). Allocations now equal the payment (14,000). Mess 1st Installment now shows 4,500 paid, 12,550 to pay.

Command: `scripts/repair-over-allocated-payment.ts --school-id=<lotus> --allocation-id=cmth052st000rikfhpkrufvyo --reason=... --apply` (written to the payment history).

## 2026-10-22 (second batch) — answers from the school's replies, all payments unchanged

Before-state of all 13 students saved outside the repo (lotus-fee-snapshots/before_2026-10-22.json).

| Student | Change | Before (total / remaining) | After |
|---|---|---|---|
| LS1626 Bhati Amit Kumar | deleted the duplicate transport pair (2nd pair, no payment) | 81,400 / 46,200 | 70,400 / 35,200 |
| LS1556 D Harif | deleted the duplicate transport pair | 105,600 / 75,600 | 88,000 / 58,000 |
| LS1255 N Sashank | deleted the duplicate transport pair; moved the Rs 35,750 paid as hostel to mess (17,050 + 17,050) and transport (1,650) | 102,300 / 43,450 | 91,300 / 32,450 |
| LS1530 S Govardhan Sai | stored total rebuilt, concession Rs 5,000 | 105,050 / 58,613 | 88,000 (final 83,000) / 39,000 |
| LS60 Haasini V G | concession Rs 18,000 as a rupee amount; moved Rs 18,000 of the payment from the tuition head with Rs 5,100 due to the one with Rs 23,100 due | final 82,191.57 / 8,891.57 | final 73,300 / 0 |
| LS88 Chethan Reddy S | concession Rs 14,500 recorded on Tuition 2nd Installment; Rs 17,050 paid as mess moved to hostel 2nd (16,550) and tuition 2nd (500); pending Rs 15,000 request rejected | final 118,800 / 14,500 | final 104,300 / 0 |

Hostel to day scholar conversions, applied by the school's 10-month rule (annual / 10 x months; hostel overpayment counts toward mess; two installments), run with scripts/set-student-residency-conversion.ts:

| Student | Rows set | Before (total / remaining) | After |
|---|---|---|---|
| LS1511 M Hayathi (Class 8-A) | hostel 28,600 (4 months), mess 20,460 (6), transport 10,560 (6); periods Hosteller 4 months / Day Scholar 6 months from 1 Oct | 89,466.66 / 32,266.66 | 102,520 / 45,320 |
| LS1548 Cheruvu Bhowthik Reddy (Class 6-A) | hostel 28,600 (4), mess 18,480 (6), transport 6,600 (6); same periods | 83,966.66 / 38,966.66 | 93,280 / 48,280 |
| LS1614 E Sri Hari (Class 8-B) | hostel 21,450 (3 months), mess 23,870 (7), transport 7,700 (7); periods Hosteller 3 / Day Scholar 7 from 1 Sep; pending Rs 17,050 request rejected (it would count the same relief twice) | 84,700 / 52,200 | 95,920 / 63,420 |

All three were applied by the user running the commands; LS1614's conversion command was run twice (the second run changed nothing).

Final check (scripts/check-lotus-expected.ts, saved record and profile computed fresh): all 13 students match the school's confirmed figures. LS1469's Rs 15,000 request is intentionally left pending (the concession is already on the record).

Tools: delete-student-extra-fee-rows, move-payment-allocation (writes a payment audit row), recalculate-student-fees --concession/--head-key, reject-pending-discount-request, set-student-residency-conversion, snapshot-student-fee-state, check-lotus-expected.

## 2026-10-23 — 10 students: concession restored to total fee x stored percent (payments unchanged)

Why: the stored final fee had been reduced by the percent of one fee head instead of the whole-year fee, so the Fee Due Report showed a much smaller concession (with paise). Code fixed in `lib/fees/studentFeeHeadDiscount.ts`.
Amounts are total x stored percent; only LS1121 and LS52 have an approved request with the rupee amount. The six fully paid students' payments equal total minus these amounts exactly.

| Adm. | Concession | Final fee before | Final fee after | Remaining after |
|---|---|---|---|---|
| LS1378 Nikhil | 7,700 | 114,677.57 | 110,000 | 0 |
| LS738 Chiruhas | 10,000 | 154,566.67 | 147,500 | 0 |
| LS1121 Deekshitha | 7,000 | 118,787.18 | 114,450 | 51,850 |
| LS1114 Lahari | 10,000 | 113,774.77 | 107,700 | 0 |
| LS489 Pranav | 9,000 | 117,255.10 | 111,700 | 0 |
| LS52 Yousuf Taha | 7,500 | 87,504.82 | 83,800 | 0 |
| LS1482 Gahan | 10,000 | 57,612.28 | 52,700 | 21,350 |
| LS1618 Rushika | 10,000 | 107,535.64 | 101,100 | 0 |
| LS1492 Vedasree | 7,000 | 108,605 | 104,100 | 18,600 |
| LS1588 Harsha | 15,000 | 108,775 | 99,400 | 49,400 |

Command: `scripts/recalculate-student-fees.ts --school-id=<lotus> --student-ids=<id> --concession=<rupees> --apply`
Left unchanged on purpose: LS323, LS1568, LS1567, LS1386 (applied concession is already a round figure; only the stored percent differs).

## 2026-10-23 — stored percent aligned to the applied concession (4 students; fee amounts and payments unchanged)

LS323 (5,000): 10.3306% -> 5.6818%. LS1568 (7,000): 7.9545% -> 9.4980%. LS1567 (7,000): 6.8426% -> 9.4980%. LS1386 (10,000): 7.5529% -> 8.1699%.
Only `StudentFee.discountPercent` was set to concession / total fee x 100. LS1568, LS1567, LS1386 amounts still to be confirmed by the school.
