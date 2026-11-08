-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913095440. History: never edit.

-- D40. Real, sourced records. Every row carries source and submitted_at.
-- rating stays null: there are no reviews yet, and an invented number would be
-- the same lie D13 already removed from the landing page.
-- The first tag is the category slug, and tool_categories is derived from it.
insert into public.tools
  (slug, name, tagline, description, website_url, pricing, pricing_model, tags, features, platforms, source, published_at)
values
  ('chatgpt','ChatGPT','General purpose AI assistant from OpenAI.','A conversational assistant built on OpenAI models, with image understanding, file analysis, web browsing, image generation and custom GPTs. The most widely used consumer AI product, and the default starting point for most people.','https://chat.openai.com','Free tier available. Paid consumer plans and usage based API pricing.','freemium',
   array['chat-and-reasoning','assistant','openai','general'],
   array['Conversational chat','Image understanding','File analysis','Web browsing','Image generation','Custom GPTs','Voice mode'],
   array['Web','iOS','Android','macOS','Windows'],'admin_seed', now()),

  ('claude','Claude','AI assistant from Anthropic, strong at long documents and code.','Anthropic''s assistant, known for long context windows, careful writing and strong coding. Includes Projects for grouping work, Artifacts for generated documents and apps, and connectors to external data.','https://claude.ai','Free tier available. Paid consumer plans and usage based API pricing.','freemium',
   array['chat-and-reasoning','assistant','anthropic','writing','long-context'],
   array['Long context','Artifacts','Projects','File analysis','Code generation','Connectors'],
   array['Web','iOS','Android','macOS','Windows'],'admin_seed', now()),

  ('gemini','Gemini','Google''s multimodal AI assistant.','Google''s assistant, natively multimodal across text, image, audio and video, with very large context windows and tight integration into Google Workspace, Search and Android.','https://gemini.google.com','Free tier available. Paid consumer plans and usage based API pricing.','freemium',
   array['chat-and-reasoning','assistant','google','multimodal'],
   array['Multimodal input','Very large context','Google Workspace integration','Image generation','Deep research'],
   array['Web','iOS','Android'],'admin_seed', now()),

  ('deepseek','DeepSeek','Open weight reasoning models with low cost API access.','A Chinese AI lab publishing open weight models with strong reasoning and coding performance at notably low API prices. Popular where cost per token is the deciding factor, and where self hosting matters.','https://www.deepseek.com','Free chat. Low cost usage based API pricing. Open weights available.','freemium',
   array['chat-and-reasoning','open-weights','reasoning','low-cost'],
   array['Reasoning models','Open weights','Low cost API','Self hostable','Code models'],
   array['Web','API','Self hosted'],'admin_seed', now()),

  ('grok','Grok','xAI''s assistant, integrated with X.','xAI''s conversational assistant, with real time access to posts on X and a deliberately less filtered conversational style. Available in the X apps and as a standalone product.','https://grok.com','Free tier with limits. Paid plans bundled with X subscriptions and a usage based API.','freemium',
   array['chat-and-reasoning','assistant','xai','realtime'],
   array['Real time X data','Image understanding','Image generation','Web search'],
   array['Web','iOS','Android'],'admin_seed', now()),

  ('mistral-le-chat','Le Chat','Mistral''s assistant, with open weight models behind it.','The assistant from French lab Mistral AI. Notable for fast responses, European hosting and a family of open weight models that can be self hosted or fine tuned.','https://chat.mistral.ai','Free tier available. Paid plans and usage based API pricing.','freemium',
   array['chat-and-reasoning','assistant','mistral','open-weights','europe'],
   array['Fast inference','Open weight models','European hosting','Code generation','Document analysis'],
   array['Web','iOS','Android'],'admin_seed', now()),

  ('cursor','Cursor','AI first code editor built on VS Code.','A fork of VS Code built around AI editing. Understands the whole repository, applies multi file edits, and runs an agent mode that can plan and execute changes across a codebase.','https://cursor.com','Free tier with limits. Paid individual and team plans.','freemium',
   array['coding','editor','ide','agent'],
   array['Codebase aware chat','Multi file edits','Agent mode','Tab completion','Terminal integration','VS Code extensions'],
   array['macOS','Windows','Linux'],'admin_seed', now()),

  ('github-copilot','GitHub Copilot','AI pair programmer inside your editor.','GitHub''s coding assistant, offering inline completion, chat and an agent mode, with deep integration into GitHub pull requests and issues. Works across most major editors.','https://github.com/features/copilot','Free tier with limits. Paid individual, business and enterprise plans.','freemium',
   array['coding','completion','github','ide'],
   array['Inline completion','Chat in editor','Pull request summaries','Agent mode','Multiple model choice'],
   array['VS Code','JetBrains','Neovim','Visual Studio','Web'],'admin_seed', now()),

  ('claude-code','Claude Code','Anthropic''s agentic coding tool for the terminal.','A command line coding agent that reads, writes and runs code in a real repository, executes shell commands and git operations, and works across multi step tasks. Also available in the IDE and on the web.','https://www.anthropic.com/claude-code','Included with paid Claude plans, or usage based API pricing.','paid',
   array['coding','agent','terminal','cli'],
   array['Repository wide edits','Runs shell commands','Git and GitHub operations','MCP servers','Subagents','Hooks'],
   array['macOS','Windows','Linux','VS Code','JetBrains','Web'],'admin_seed', now()),

  ('windsurf','Windsurf','Agentic IDE with a persistent codebase understanding.','An AI native editor whose agent keeps working context across a session, so it can carry a multi step task through a codebase without being re-briefed at every turn.','https://windsurf.com','Free tier with limits. Paid individual and team plans.','freemium',
   array['coding','editor','ide','agent'],
   array['Agent mode','Codebase indexing','Inline edits','Terminal commands','Multi file refactors'],
   array['macOS','Windows','Linux'],'admin_seed', now()),

  ('cline','Cline','Open source autonomous coding agent for VS Code.','An open source VS Code extension that runs an autonomous coding agent against your repository, with explicit approval for each file change and command. Bring your own API key.','https://cline.bot','Free and open source. You pay your own model provider.','free',
   array['coding','agent','open-source','vscode'],
   array['Autonomous edits','Step approval','Bring your own key','Terminal execution','MCP support'],
   array['VS Code'],'admin_seed', now()),

  ('v0','v0','Generates React and Tailwind interfaces from prompts.','Vercel''s UI generator. Describe an interface and it produces working React with Tailwind and shadcn/ui components, which you can iterate on and deploy straight to Vercel.','https://v0.dev','Free tier with limits. Paid plans by usage.','freemium',
   array['coding','ui','frontend','generation'],
   array['Prompt to UI','React and Tailwind output','shadcn/ui components','Deploy to Vercel','Iterative refinement'],
   array['Web'],'admin_seed', now()),

  ('bolt-new','Bolt','Builds and runs full stack apps in the browser.','Prompt to full stack application, running entirely in the browser via WebContainers. Installs packages, runs a dev server and deploys, with no local setup.','https://bolt.new','Free tier with limits. Paid plans by token usage.','freemium',
   array['coding','fullstack','browser','generation'],
   array['Prompt to app','Runs in browser','Package installation','Live preview','One click deploy'],
   array['Web'],'admin_seed', now()),

  ('replit','Replit','Cloud IDE with an AI agent that builds and deploys.','A browser based development environment with an AI agent that can scaffold, edit and deploy an application. Removes local setup entirely, which makes it common for teaching and prototyping.','https://replit.com','Free tier available. Paid plans for more compute and agent usage.','freemium',
   array['coding','cloud-ide','agent','deployment'],
   array['Browser IDE','AI agent','Hosting and deployment','Collaborative editing','Databases'],
   array['Web','iOS','Android'],'admin_seed', now()),

  ('midjourney','Midjourney','Image generation known for strong aesthetics.','An image generator with a distinctive and consistently strong aesthetic default. Long run through Discord, now with its own web interface, and widely used for concept art and stylised imagery.','https://www.midjourney.com','Paid subscription plans. No permanent free tier.','paid',
   array['image-generation','art','discord','stylised'],
   array['Text to image','Image to image','Style references','Character references','Upscaling','Inpainting'],
   array['Web','Discord'],'admin_seed', now()),

  ('flux','FLUX','Open weight image models from Black Forest Labs.','A family of image models from Black Forest Labs, available as open weights and through hosted APIs. Strong at prompt adherence and legible text inside images.','https://blackforestlabs.ai','Open weights available. Usage based hosted API pricing.','freemium',
   array['image-generation','open-weights','api'],
   array['Text to image','Image editing','Open weights','Text rendering','Hosted API'],
   array['API','Self hosted','Web'],'admin_seed', now()),

  ('stable-diffusion','Stable Diffusion','Open image models you can run yourself.','Stability AI''s open image model family. The foundation of most self hosted image generation, with a large ecosystem of fine tunes, LoRAs and interfaces built on top.','https://stability.ai','Open weights, free to self host. Paid hosted API and licence tiers.','freemium',
   array['image-generation','open-weights','self-hosted'],
   array['Text to image','Image to image','Inpainting','ControlNet','LoRA fine tuning','Self hostable'],
   array['Self hosted','API','Web'],'admin_seed', now()),

  ('ideogram','Ideogram','Image generation with reliable text rendering.','An image generator that stands out for rendering readable text inside images, which makes it a common choice for posters, logos and social graphics.','https://ideogram.ai','Free tier with limits. Paid subscription plans.','freemium',
   array['image-generation','typography','design'],
   array['Text in images','Text to image','Style presets','Magic prompt','Upscaling'],
   array['Web','iOS','Android'],'admin_seed', now()),

  ('leonardo-ai','Leonardo AI','Image generation aimed at game and production art.','An image platform aimed at production art workflows, with fine tuned model presets, consistent character tools and asset generation for games and marketing.','https://leonardo.ai','Free daily credits. Paid subscription plans.','freemium',
   array['image-generation','game-art','production'],
   array['Text to image','Custom model training','Consistent characters','Canvas editor','Texture generation'],
   array['Web','iOS','Android'],'admin_seed', now()),

  ('adobe-firefly','Adobe Firefly','Image generation trained for commercial safety.','Adobe''s generative image family, trained on licensed and public domain content and designed for commercial use, with deep integration into Photoshop and the rest of Creative Cloud.','https://firefly.adobe.com','Free credits. Included in Creative Cloud plans and sold separately.','freemium',
   array['image-generation','adobe','commercial','design'],
   array['Text to image','Generative fill','Generative expand','Photoshop integration','Commercially safe training data'],
   array['Web','Photoshop','Illustrator'],'admin_seed', now())
on conflict (slug) do nothing;
