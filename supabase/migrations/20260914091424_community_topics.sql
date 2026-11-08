-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260914091424. History: never edit.

-- Tracker task 4.3. Seeded with the eleven launch slugs.
-- This is the one place seeding real rows is correct: a topic is structure,
-- not content, so D30 does not apply to it.

create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  slug        extensions.citext not null unique,
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),

  -- The cast to text is deliberate. citext makes the ~ operator case
  -- insensitive, so on a citext column '^[a-z0-9-]+$' happily accepts
  -- 'Show-And-Tell'. This is the identical defect fixed on profiles.username
  -- earlier today in community_username_lowercase_and_signup_race.
  constraint topics_slug_format check (slug::text ~ '^[a-z0-9-]{2,40}$'),
  constraint topics_name_len    check (char_length(name) between 1 and 60),
  constraint topics_desc_len    check (description is null or char_length(description) <= 200)
);

create index idx_topics_sort on public.topics (sort_order, slug);

alter table public.topics enable row level security;

create policy topics_select_all on public.topics
  for select to anon, authenticated using (true);

-- No insert, update or delete policy, and no write grant to anybody including
-- moderators. Topics change by migration.
revoke all on public.topics from public, anon, authenticated;
grant select on public.topics to anon, authenticated;

insert into public.topics (slug, name, sort_order) values
  ('show-and-tell', 'Show and tell',  10),
  ('questions',     'Questions',      20),
  ('news',          'News',           30),
  ('writing',       'Writing',        40),
  ('images',        'Images',         50),
  ('video',         'Video',          60),
  ('audio',         'Audio',          70),
  ('code',          'Code',           80),
  ('agents',        'Agents',         90),
  ('data',          'Data',          100),
  ('productivity',  'Productivity',  110);
