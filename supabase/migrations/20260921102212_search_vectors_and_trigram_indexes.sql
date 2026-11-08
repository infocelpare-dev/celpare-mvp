-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260921102212. History: never edit.

-- Celpare Search, part 1: the retrieval indexes.
--
-- tools already had a weighted search_vector and a GIN index. models, profiles
-- and posts had nothing, so a search across them would have been the LIKE '%..%'
-- the brief rules out. Each gets the SAME shape as tools: a generated tsvector
-- with setweight, and a GIN index on it.
--
-- pg_trgm is enabled for PREFIX and TYPO matching, which a tsvector cannot do:
-- to_tsvector('english','clau') is not a prefix of 'claude', and a tsquery
-- prefix match (clau:*) still cannot survive a transposed letter. Trigram
-- similarity handles both and is indexable.

create extension if not exists pg_trgm with schema extensions;

-- MODELS ---------------------------------------------------------------------
-- Same weights as tools: the name is A, the things it IS are B, prose is D.
alter table public.models
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(provider, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, public.immutable_join(tags)), 'B') ||
    setweight(to_tsvector('english'::regconfig, public.immutable_join(modalities)), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'D')
  ) stored;

create index if not exists models_search_idx on public.models using gin (search_vector);
create index if not exists models_status_idx on public.models (status) where status = 'approved';
create index if not exists models_name_trgm_idx on public.models using gin (name extensions.gin_trgm_ops);
create index if not exists models_provider_trgm_idx on public.models using gin (provider extensions.gin_trgm_ops);

-- PROFILES -------------------------------------------------------------------
-- The handle is 'simple' rather than 'english': a username is not English and
-- must not be stemmed. "ameagmahad" surviving as itself is the whole point.
alter table public.profiles
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple'::regconfig, coalesce(username::text, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(full_name, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, public.immutable_join(skills)), 'B') ||
    setweight(to_tsvector('english'::regconfig, public.immutable_join(interests)), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(bio, '')), 'C') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(location, '')), 'D')
  ) stored;

create index if not exists profiles_search_idx on public.profiles using gin (search_vector);
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin ((username::text) extensions.gin_trgm_ops);
create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (full_name extensions.gin_trgm_ops)
  where full_name is not null;

-- The new column is NOT granted to anon or authenticated. The default ACL that
-- RESUME rule 6 warns about applies to new TABLES, not to new columns on a
-- table whose grants are already column level, so search_vector is readable
-- only by the definer functions that need it. Verified after applying.
revoke all (search_vector) on public.profiles from anon, authenticated;

-- TOOLS ----------------------------------------------------------------------
-- The tsvector stays exactly as it was. Only the trigram companions are new.
create index if not exists tools_name_trgm_idx on public.tools using gin (name extensions.gin_trgm_ops);
create index if not exists tools_slug_trgm_idx on public.tools using gin ((slug::text) extensions.gin_trgm_ops);

-- POSTS ----------------------------------------------------------------------
-- Body only. A post has no title and no tags; its topic is a join.
alter table public.posts
  add column if not exists search_vector tsvector
  generated always as (to_tsvector('english'::regconfig, coalesce(body, ''))) stored;

create index if not exists posts_search_idx on public.posts using gin (search_vector);
