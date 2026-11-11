-- Catalogue: 21 widely used AI tools and 3 categories (founder, 2026-11-11, D266).
--
-- WHY THESE 21. The founder asked for famous AI tools with 50 million or more
-- users. Each one below was not yet in the catalogue and has a published figure
-- of at least 50 million users (monthly, registered or total, as the source
-- states it). The figures and their sources are listed in
-- docs/context/catalog-seed-2026-11-11.md. No user number is written into the
-- catalogue itself: a count would go stale, and D13 and D30 forbid showing a
-- number we cannot keep true.
--
-- FACTS ONLY. Descriptions say what each product does, not how good it is.
-- Pricing is general (free tier or paid plans), never a price, which moves.
--
-- ONE BATCH. Every row has source admin_seed and the same submitted_at,
-- 2026-11-11 12:00:00+00, so the batch can be found, or removed, in one query:
--   delete from public.tools
--   where source = 'admin_seed' and submitted_at = '2026-11-11 12:00:00+00';
-- tool_categories rows go with them (on delete cascade).
--
-- The first tag is the category slug, as in the 2026-09-13 seed, and
-- tool_categories is derived from it at the end.

insert into public.categories (slug, name, description, sort_order) values
  ('design',                   'Design',                   'Design, photo editing and visual content tools.', 35),
  ('writing-and-productivity', 'Writing and productivity', 'Writing, documents, slides and workspace tools.', 65),
  ('education',                'Education',                'Study and homework help.', 90)
on conflict (slug) do nothing;

insert into public.tools
  (slug, name, tagline, description, website_url, pricing, pricing_model, tags, features, platforms, status, source, submitted_at, published_at)
values
  ('microsoft-copilot','Microsoft Copilot','Microsoft''s AI assistant on the web, in Windows and on mobile.','Microsoft''s consumer AI assistant, available on the web, in Windows, in the Edge browser and as mobile and desktop apps. It answers questions using web results, writes and summarises text, understands images and creates images.','https://copilot.microsoft.com','Free. Paid Microsoft 365 plans add Copilot inside Word, Excel and other Microsoft apps.','freemium',
   array['chat-and-reasoning','assistant','microsoft','general'],
   array['Conversational chat','Answers from the web','Image understanding','Image generation','Voice conversation'],
   array['Web','Windows','macOS','iOS','Android'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('meta-ai','Meta AI','Meta''s AI assistant inside WhatsApp, Instagram, Facebook and Messenger.','Meta''s assistant, available inside WhatsApp, Instagram, Facebook and Messenger, on the web at meta.ai, in a standalone app and on Meta''s smart glasses. It answers questions, writes text, and creates and edits images.','https://www.meta.ai','Free.','free',
   array['chat-and-reasoning','assistant','meta','general'],
   array['Conversational chat','Inside WhatsApp, Instagram, Facebook and Messenger','Image generation','Image editing','Voice conversation'],
   array['Web','iOS','Android','WhatsApp','Instagram','Facebook','Messenger'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('doubao','Doubao','ByteDance''s AI assistant.','ByteDance''s general assistant, ranked the most used AI app in China by monthly users in 2026 (QuestMobile). It chats, searches the web, writes, reads documents and images, and creates images. Chinese language first.','https://www.doubao.com','Free. ByteDance announced paid subscriptions in 2026.','freemium',
   array['chat-and-reasoning','assistant','bytedance','china'],
   array['Conversational chat','Web search','Document and image understanding','Image generation','Voice conversation'],
   array['Web','iOS','Android','Windows','macOS'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('qwen','Qwen','Alibaba''s AI assistant, built on its Qwen models.','Alibaba''s consumer assistant, built on its own Qwen family of models, many of which are also released with open weights. It chats, writes, and reads files and images. In China the Qwen app (qianwen.com) can also carry out tasks inside Alibaba services.','https://chat.qwen.ai','Free.','free',
   array['chat-and-reasoning','assistant','alibaba','open-weights','china'],
   array['Conversational chat','File and image understanding','Image generation','Open weight models','Tasks in Alibaba services (China app)'],
   array['Web','iOS','Android'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('tencent-yuanbao','Tencent Yuanbao','Tencent''s AI assistant, with search over WeChat articles.','Tencent''s assistant, running on Tencent''s Hunyuan models and on DeepSeek models, with search that includes articles published on WeChat Official Accounts. Chinese language first.','https://yuanbao.tencent.com','Free.','free',
   array['chat-and-reasoning','assistant','tencent','china'],
   array['Conversational chat','Search over WeChat articles','Choice of Hunyuan or DeepSeek models','Document and image understanding'],
   array['Web','iOS','Android','Windows','macOS'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('quark','Quark','Alibaba''s AI search and assistant app.','An Alibaba app that combines search, an AI assistant built on Alibaba''s Qwen models, cloud storage and document tools in one place. Chinese language first.','https://www.quark.cn','Free core features. Paid membership.','freemium',
   array['search-and-research','assistant','alibaba','search','china'],
   array['AI search','AI assistant','Cloud storage','Document scanning and tools'],
   array['Web','iOS','Android','Windows','macOS'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('yandex-alice','Alice','Yandex''s voice and chat assistant.','Yandex''s assistant, built on Yandex''s own YandexGPT models. It works by voice on Yandex Station smart speakers and inside Yandex apps and the Yandex Browser, and as a chat assistant. Russian language first.','https://alice.yandex.ru',null,null,
   array['chat-and-reasoning','assistant','yandex','voice'],
   array['Voice assistant','Conversational chat','Smart speaker control','Built into Yandex Browser'],
   array['Web','iOS','Android','Smart speakers'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('google-ai-mode','Google AI Mode','Google Search''s conversational AI mode.','A mode inside Google Search that answers complex questions with an AI written response, links to the web pages it drew on, and takes follow up questions. Runs on Google''s Gemini models.','https://search.google/ways-to-search/ai-mode/','Free.','free',
   array['search-and-research','answer-engine','google','search'],
   array['AI written answers','Links to sources','Follow up questions','Image and voice search'],
   array['Web','iOS','Android'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('amazon-rufus','Amazon Rufus','Amazon''s AI shopping assistant.','An assistant inside the Amazon shopping app and website that answers questions about products, compares items, summarises customer reviews and shows price history.','https://www.aboutamazon.com/news/retail/amazon-rufus','Free.','free',
   array['search-and-research','shopping','amazon','assistant'],
   array['Product questions','Product comparison','Review summaries','Price history'],
   array['Web','iOS','Android'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('canva','Canva','Online design platform with built in AI tools.','A browser based design tool for social posts, presentations, documents, videos and print, with AI features for generating images, writing text, removing backgrounds and resizing designs.','https://www.canva.com','Free plan. Paid Pro and Teams plans.','freemium',
   array['design','templates','presentations','image'],
   array['Templates','AI image generation','AI writing','Background removal','Resize designs','Team collaboration'],
   array['Web','iOS','Android','Windows','macOS'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('capcut','CapCut','ByteDance''s video editor with AI tools.','A video editor from ByteDance, the company behind TikTok, with templates and AI features such as automatic captions, background removal, text to speech and script to video.','https://www.capcut.com','Free plan. Paid Pro subscription.','freemium',
   array['video','editing','bytedance','social'],
   array['Templates','Automatic captions','Background removal','Text to speech','Script to video'],
   array['Web','iOS','Android','Windows','macOS'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('filmora','Filmora','Wondershare''s video editor with AI features.','A desktop and mobile video editor from Wondershare, with AI tools including an editing assistant, AI clip extension, smart cutout and automatic captions.','https://filmora.wondershare.com','Free version exports with a watermark. Paid subscription or perpetual licence.','freemium',
   array['video','editing','wondershare'],
   array['AI editing assistant','AI clip extension','Smart cutout','Automatic captions','Templates and effects'],
   array['Windows','macOS','iOS','Android'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('pixverse','PixVerse','AI video generator for short clips and effects.','Generates short videos from text or images, with ready made effects and templates aimed at social content.','https://pixverse.ai','Free daily credits. Paid subscription plans.','freemium',
   array['video','generation','text-to-video','image-to-video','social'],
   array['Text to video','Image to video','Effect templates'],
   array['Web','iOS','Android'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('picsart','Picsart','Photo and video editor with AI generation tools.','A photo and video editing app with AI tools for generating images, removing and replacing backgrounds, retouching and enhancing photos, plus templates for social posts.','https://picsart.com','Free plan. Paid subscription plans.','freemium',
   array['design','photo-editing','image','templates'],
   array['AI image generation','Background removal and replacement','Photo retouching','Photo enhancement','Templates'],
   array['Web','iOS','Android'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('photoroom','Photoroom','AI photo editor for product pictures.','An AI photo editor built around background removal, used to make product photos with generated backgrounds, shadows and batch editing. Also offers an API for developers.','https://www.photoroom.com','Free plan with a watermark. Paid Pro plans and a usage based API.','freemium',
   array['design','photo-editing','ecommerce','background-removal','api'],
   array['Background removal','AI backgrounds','AI shadows','Batch editing','API'],
   array['Web','iOS','Android','API'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('magnific','Magnific','Freepik''s AI creative suite, renamed Magnific in 2026.','The AI creative suite formerly known as Freepik, renamed Magnific in April 2026. It offers image and video generation using several models, image upscaling and editing tools in one place.','https://www.magnific.com','Free tier with limits. Paid subscription plans.','freemium',
   array['image-generation','video','upscaling','freepik'],
   array['Image generation','Video generation','Choice of models','Image upscaling','Image editing'],
   array['Web'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('gamma','Gamma','Creates presentations, documents and websites with AI.','Generates slide decks, documents, simple websites and social posts from a prompt or pasted text, then lets you edit them and export to PowerPoint or PDF.','https://gamma.app','Free credits. Paid subscription plans.','freemium',
   array['writing-and-productivity','writing','presentations','slides'],
   array['Prompt to presentation','Documents and web pages','Editing after generation','Export to PowerPoint and PDF'],
   array['Web'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('notion','Notion','Workspace for notes, docs and projects, with Notion AI built in.','A connected workspace for notes, documents, wikis, databases and projects. Notion AI writes and summarises, answers questions across your workspace and connected apps, takes meeting notes, and runs custom agents.','https://www.notion.com','Free plan. Paid Plus, Business and Enterprise plans.','freemium',
   array['writing-and-productivity','writing','notes','workspace','agents'],
   array['Notes and documents','Databases','AI writing and summaries','Workspace Q and A','Meeting notes','Custom agents'],
   array['Web','iOS','Android','Windows','macOS'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('speechify','Speechify','Reads text aloud in AI voices.','A text to speech app that reads documents, web pages, PDFs, emails and scanned text aloud, with adjustable speed and many voices and languages. Also offers AI voice over and dubbing.','https://speechify.com','Free plan with standard voices. Paid Premium subscription.','freemium',
   array['voice-and-audio','text-to-speech','reading','accessibility'],
   array['Text to speech','Reads PDFs and web pages','Scanned text reading','Adjustable speed','AI voice over','Dubbing'],
   array['Web','iOS','Android','macOS','Chrome extension'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('moises','Moises','AI music app that separates vocals and instruments.','Splits a song into separate tracks such as vocals, drums, bass and guitar, and detects chords, key and tempo, for practising, remixing and transcription. Made by Music AI.','https://moises.ai','Free plan. Paid subscription plans.','freemium',
   array['voice-and-audio','music','stem-separation'],
   array['Stem separation','Chord detection','Key and tempo detection','Speed and pitch control'],
   array['Web','iOS','Android','Windows','macOS'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00'),

  ('gauth','Gauth','AI homework helper from ByteDance.','A study app owned by ByteDance that answers homework questions from a photo or typed question, in maths and other subjects, with step by step explanations.','https://www.gauthmath.com','Free with limits. Paid subscription.','freemium',
   array['education','homework','math','study'],
   array['Photo to answer','Step by step explanations','Maths and other subjects'],
   array['Web','iOS','Android'],'approved','admin_seed','2026-11-11 12:00:00+00','2026-11-11 12:00:00+00')
on conflict (slug) do nothing;

-- Derive tool_categories from the first tag, as the 2026-09-13 seed does.
insert into public.tool_categories (tool_id, category_id)
select t.id, c.id
from public.tools t
join public.categories c on c.slug = t.tags[1]::extensions.citext
where t.source = 'admin_seed' and t.submitted_at = '2026-11-11 12:00:00+00'
on conflict do nothing;

-- Search document frequencies include the new descriptions.
select public.refresh_tool_terms();
