-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260925084629. History: never edit.

alter table public.dm_messages drop constraint dm_messages_body_len;
alter table public.dm_messages add constraint dm_messages_body_len
  check ((body is null) or ((char_length(body) >= 1) and (char_length(body) <= 20000)));
