-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913100020. History: never edit.

-- Three advisor warnings, all mine, all from the last migration.
--
-- The root cause was hiding the term frequency table. That forced tools_tsquery
-- to be SECURITY DEFINER, which then had to be callable by anon, which is
-- exactly the pattern the linter is right to flag. But word frequencies over
-- public tool descriptions are not secret. Publishing them lets the function
-- drop back to SECURITY INVOKER, so RLS applies as a second layer again.
--
-- A plain table rather than a materialized view, because a materialized view
-- with a select policy trips the materialized_view_in_api lint instead.

drop function if exists public.refresh_tool_term_df();
drop materialized view if exists public.tool_term_df;

create table if not exists public.tool_terms (
  word text primary key,
  ndoc integer not null
);

alter table public.tool_terms enable row level security;

drop policy if exists tool_terms_select on public.tool_terms;
create policy tool_terms_select on public.tool_terms
  for select to anon, authenticated using (true);

create or replace function public.refresh_tool_terms()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.tool_terms;
  insert into public.tool_terms (word, ndoc)
  select word, ndoc
  from ts_stat('select search_vector from public.tools where status = ''approved''');
end;
$function$;

-- Rebuilding the corpus statistics is an admin operation, not a public one.
revoke all on function public.refresh_tool_terms() from public, anon, authenticated;

-- Now SECURITY INVOKER, so RLS on tools still applies when this is used.
create or replace function public.tools_tsquery(q text)
returns tsquery
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  total numeric;
  kept text;
  fallback text;
begin
  if q is null or btrim(q) = '' then
    return null;
  end if;

  select greatest(count(*), 1)::numeric into total
  from public.tools where status = 'approved';

  with lex as (
    select distinct l.lexeme
    from unnest(to_tsvector('english'::regconfig, q)) l
  )
  select
    string_agg(quote_literal(lex.lexeme), ' | ')
      filter (where coalesce(tt.ndoc, 0)::numeric / total <= 0.25),
    string_agg(quote_literal(lex.lexeme), ' | ')
  into kept, fallback
  from lex
  left join public.tool_terms tt on tt.word = lex.lexeme;

  if kept is null and fallback is null then
    return null;
  end if;

  return to_tsquery('english'::regconfig, coalesce(kept, fallback));
end;
$function$;

grant execute on function public.tools_tsquery(text) to anon, authenticated;

-- Missing search_path on the generated column helper.
create or replace function public.immutable_join(arr text[])
returns text
language sql
immutable
parallel safe
set search_path to 'public'
as $function$ select coalesce(array_to_string(arr, ' '), '') $function$;

select public.refresh_tool_terms();
