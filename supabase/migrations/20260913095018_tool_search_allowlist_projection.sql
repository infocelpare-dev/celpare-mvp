-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913095018. History: never edit.

-- D39. The AI data boundary.
--
-- The return type IS the allowlist. A function with these seven columns in its
-- signature cannot leak an eighth, no matter what the calling code selects or
-- what a prompt talks the model into asking for. This is the mechanism that
-- 03-data-model.md and 06-ai-gateway.md require: a read only projection, never
-- a prompt instruction.
--
-- Deliberately SECURITY INVOKER, not DEFINER. RLS then applies as a second
-- layer on top of the column allowlist: the signature limits the columns, the
-- policy limits the rows. A DEFINER function would bypass the policy and leave
-- only one control standing.

create or replace function public.search_tools(q text, lim integer default 8)
returns table (
  slug text,
  name text,
  description text,
  pricing text,
  tags text[],
  rating numeric,
  features text[]
)
language sql
stable
security invoker
set search_path to 'public', 'extensions'
as $function$
  select
    t.slug::text,
    t.name,
    -- Truncated so one verbose row cannot eat the model's context window.
    left(coalesce(t.description, ''), 600),
    t.pricing,
    t.tags,
    t.rating,
    t.features
  from public.tools t
  where t.status = 'approved'
    and (
      q is null
      or btrim(q) = ''
      or t.search_vector @@ websearch_to_tsquery('english', q)
    )
  order by
    case
      when q is null or btrim(q) = '' then 0
      else ts_rank(t.search_vector, websearch_to_tsquery('english', q))
    end desc,
    t.popularity_score desc,
    t.name asc
  -- Hard cap. The founder's Notion note: limit token and call.
  limit least(greatest(coalesce(lim, 8), 1), 20);
$function$;

grant execute on function public.search_tools(text, integer) to anon, authenticated;
