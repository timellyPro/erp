-- Last date to pay each fee head (hostel, mess, bus, tuition, ...), set by the school admin and shown to parents.
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "feeLastDates" JSONB;
