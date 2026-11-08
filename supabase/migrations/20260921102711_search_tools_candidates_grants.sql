-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921102711. History: never edit.

revoke all on function public.search_tools_candidates(text, integer) from public;
grant execute on function public.search_tools_candidates(text, integer) to anon, authenticated;

comment on function public.search_tools_candidates(text, integer) is
'Tool retrieval: the candidate pool plus the raw signals a ranker needs. It returns SIGNALS, NOT A RANK, so src/lib/search/ranking.ts can be retuned without opening a query, the same split D29 applied to the feed. SECURITY INVOKER, so tools_select_anon and tools_select_auth still apply underneath; status = ''approved'' is asserted here as well because the authenticated policy admits a developer''s own drafts and a draft must not surface in a public search even to its author. Retrieval arms: exact, prefix, full text, prefix full text, trigram and tag overlap, each index backed and bitmap-ORed.';
