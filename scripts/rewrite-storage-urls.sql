-- Rewrite Supabase Storage URLs after copying the buckets to a NEW project.
-- Only needed if you copy Storage; skip it if you keep the old project for files.
--
-- 1. Set old_ref / new_ref below.
-- 2. Run in the NEW database inside psql / the SQL editor. It rewrites inside one
--    transaction and ends with ROLLBACK. Read the NOTICE counts, and if they look right,
--    change the last line to COMMIT and run again.
-- Handles text columns and text[] columns (e.g. news feed photos).

BEGIN;

DO $$
DECLARE
  old_ref text := 'OLDREF';   -- e.g. abcdefghijklmnop
  new_ref text := 'NEWREF';   -- e.g. cewthwgdzavfnonrduan
  old_host text;
  new_host text;
  r record;
  n bigint;
BEGIN
  IF old_ref = 'OLDREF' OR new_ref = 'NEWREF' THEN
    RAISE EXCEPTION 'Set old_ref and new_ref first';
  END IF;
  old_host := old_ref || '.supabase.co';
  new_host := new_ref || '.supabase.co';

  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type, c.udt_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.table_name <> '_prisma_migrations'
      AND (c.data_type IN ('text', 'character varying') OR c.udt_name = '_text')
  LOOP
    IF r.udt_name = '_text' THEN
      EXECUTE format(
        'UPDATE %I SET %I = ARRAY(SELECT replace(x, %L, %L) FROM unnest(%I) AS x) WHERE array_to_string(%I, ''|'') LIKE %L',
        r.table_name, r.column_name, old_host, new_host, r.column_name, r.column_name, '%' || old_host || '%');
    ELSE
      EXECUTE format(
        'UPDATE %I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
        r.table_name, r.column_name, r.column_name, old_host, new_host, r.column_name, '%' || old_host || '%');
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE '% . %: % row(s) rewritten', r.table_name, r.column_name, n;
    END IF;
  END LOOP;
END
$$;

ROLLBACK;  -- change to COMMIT once the counts above look right
