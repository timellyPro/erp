-- Months a school bills in its academic year for hostel / day-scholar conversions (default 12 = June to May).
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "residencyYearMonths" INTEGER NOT NULL DEFAULT 12;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SchoolSettings_residencyYearMonths_check') THEN
    ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_residencyYearMonths_check" CHECK ("residencyYearMonths" BETWEEN 1 AND 12);
  END IF;
END
$$;
