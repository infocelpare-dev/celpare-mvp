-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921122236. History: never edit.

-- The comment on `normalized` said it was kept "so analysis survives the history
-- row being cleared". MEASURED IN A BROWSER: it does not. `query_id` cascades on
-- delete, so removing one search from your history takes its impressions and
-- clicks with it, and the normalized copy goes with the row.
--
-- The cascade is KEPT, because it is the privacy safe default and it is what D85
-- means: a Clear that deletes rather than hides. What changes is the claim.
--
-- The trade is real and worth naming for whoever reads this next. The behaviour
-- rows are partly collective: what people clicked for a query is a fact about the
-- query, not only about the person. Cascading means one person clearing their
-- history erases that evidence for everybody, and at two accounts that is all of
-- it. The alternative is to anonymise on delete rather than cascade, nulling
-- `query_id` AND `user_id` and keeping the normalized query, the result and the
-- position, which keeps the collective signal and destroys the personal link.
-- That is a privacy decision for the founder, not one to take quietly in a
-- migration, so it is recorded rather than applied.
comment on column public.search_result_events.normalized is
  'The query this result was shown for. NOT a survivor: query_id cascades, so clearing a search deletes these rows with it. Kept because analysis and the behaviour aggregate both key on the normalized text rather than on the history row.';

comment on column public.search_result_events.query_id is
  'The search_events row this result was shown for. ON DELETE CASCADE, so clearing your history also deletes what was recorded about it. Privacy safe, and it costs the collective click signal for that query. See the migration note; anonymising on delete is the alternative and is the founder''s call.';
