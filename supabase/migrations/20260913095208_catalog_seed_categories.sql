-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913095208. History: never edit.

-- The eight category names are taken verbatim from the landing page showcase in
-- src/components/landing/tools-showcase.tsx, so the marketing page and the
-- catalog describe the ecosystem the same way.
insert into public.categories (slug, name, description, sort_order) values
  ('chat-and-reasoning',  'Chat and reasoning',  'General assistants and reasoning models.', 10),
  ('coding',              'Coding',              'Editors, agents and developer tooling.', 20),
  ('image-generation',    'Image generation',    'Models and apps that make images.', 30),
  ('video',               'Video',               'Video generation, avatars and editing.', 40),
  ('voice-and-audio',     'Voice and audio',     'Speech, music and transcription.', 50),
  ('search-and-research', 'Search and research', 'Answer engines and research tools.', 60),
  ('automation',          'Automation',          'Workflows, agents and orchestration.', 70),
  ('backend-and-data',    'Backend and data',    'Databases, vector stores and infrastructure.', 80)
on conflict (slug) do nothing;
