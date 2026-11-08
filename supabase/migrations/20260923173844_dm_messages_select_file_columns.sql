-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260923173844. History: never edit.

-- friends_and_safe_dm_files (4BA) added file_name and file_size and granted INSERT
-- on them but not SELECT. dm_messages is granted column by column, so the thread
-- query, which names both, was refused whole with 42501 and every conversation
-- rendered empty. Rows are still limited to participants by dm_messages_select_own.
grant select (file_name, file_size) on public.dm_messages to authenticated;
