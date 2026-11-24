-- Catalogue: a Website builders category, Lovable, and Replit, Bolt and v0
-- filed under it (founder, 2026-11-24).
--
-- WHY. Asked live "Build a website for my business without coding", Ask
-- Celpare said the catalogue had no website builders. Lovable was missing, and
-- Replit, Bolt and v0 were filed only under Coding, with descriptions about
-- full stack apps, React and IDEs that never said "website" or "without code".
-- All four build websites and web apps from a plain description.
--
-- FACTS ONLY. Lovable's description follows its own pricing page
-- (lovable.dev/pricing, read 2026-11-24): it builds websites and web apps from
-- a chat with no technical knowledge needed, has a free plan with daily build
-- credits and paid plans by monthly credits, publishes to lovable.app
-- addresses and supports custom domains. No price is written (D13, D30).
-- No logo yet: fetching lovable.dev's icon was not allowed in this session, so
-- the card shows a monogram until one is uploaded.
--
-- ONE BATCH. Lovable has source admin_seed and submitted_at
-- 2026-11-24 12:00:00+00, so it can be found or removed in one query.
-- Replit, Bolt and v0 keep their own submitted_at and Coding; they gain a
-- second category, a "website-builders" tag, and one sentence each.

insert into public.categories (slug, name, description, sort_order) values
  ('website-builders', 'Website builders', 'Build websites and web apps from a plain description, without coding.', 25)
on conflict (slug) do nothing;

insert into public.tools
  (slug, name, tagline, description, website_url, pricing, pricing_model, tags, features, platforms, status, source, submitted_at, published_at)
values
  ('lovable','Lovable','Builds websites and web apps from a chat, no coding needed.','Describe the website or web app you want and Lovable builds it, then keep chatting to change it. Made for people with no technical knowledge. Publish on a lovable.app address or your own domain.','https://lovable.dev','Free plan with daily build credits. Paid plans by monthly credits.','freemium',
   array['website-builders','no-code','web-apps','generation'],
   array['Build by chatting','Websites and web apps','Plan mode','Publish to a lovable.app address','Custom domains'],
   array['Web'],'approved','admin_seed','2026-11-24 12:00:00+00','2026-11-24 12:00:00+00')
on conflict (slug) do nothing;

update public.tools set
  description = description || ' You can describe a website or web app in plain words and get it built without writing code.',
  tags = array_append(tags, 'website-builders')
where slug = 'bolt-new' and not ('website-builders' = any(tags));

update public.tools set
  description = description || ' Its agent can build a website or web app from a plain description, so you can start without coding.',
  tags = array_append(tags, 'website-builders')
where slug = 'replit' and not ('website-builders' = any(tags));

update public.tools set
  description = description || ' You can describe a website or web page in plain words and get it built without writing code.',
  tags = array_append(tags, 'website-builders')
where slug = 'v0' and not ('website-builders' = any(tags));

insert into public.tool_categories (tool_id, category_id)
select t.id, c.id
from public.tools t
join public.categories c on c.slug = 'website-builders'
where t.slug in ('lovable', 'bolt-new', 'replit', 'v0')
on conflict do nothing;

-- Search document frequencies include the new words.
select public.refresh_tool_terms();
