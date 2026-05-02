-- Per-school HyperPG API host (sandbox vs production). Falls back to HYPERPG_BASE_URL env when null.
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "hyperpgBaseUrl" TEXT;
