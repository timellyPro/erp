-- Closes the last "RLS Disabled in Public" advisor finding, on Prisma's own
-- migration-tracking table. No policies needed: Prisma always connects as the
-- table-owning role, which bypasses RLS regardless of this setting.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
