-- Required for automatic reference relationship discovery by the ORM generator.
DO
$do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint fk
    JOIN pg_attribute source_column
      ON source_column.attrelid = fk.conrelid AND source_column.attnum = fk.conkey[1]
    JOIN pg_attribute target_column
      ON target_column.attrelid = fk.confrelid AND target_column.attnum = fk.confkey[1]
    WHERE fk.contype = 'f'
      AND fk.conrelid = 'public.articles'::regclass
      AND fk.confrelid = 'public.content_types'::regclass
      AND cardinality(fk.conkey) = 1
      AND source_column.attname = 'content_type_id'
      AND target_column.attname = 'id'
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT articles_content_type_id_fkey
      FOREIGN KEY (content_type_id) REFERENCES public.content_types(id);
  END IF;
END
$do$;
