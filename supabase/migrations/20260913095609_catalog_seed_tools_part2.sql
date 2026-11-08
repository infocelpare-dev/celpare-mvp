-- Imported from supabase_migrations.schema_migrations (phase OPS, step 6).
-- Applied to project uckulakdtmaqgwakowyq as version 20260913095609. History: never edit.

insert into public.tools
  (slug, name, tagline, description, website_url, pricing, pricing_model, tags, features, platforms, source, published_at)
values
  ('runway','Runway','Video generation and editing for production work.','A video generation and editing platform used in film and advertising, combining text to video, image to video, camera controls and a set of traditional editing tools.','https://runwayml.com','Free tier with limited credits. Paid subscription and enterprise plans.','freemium',
   array['video','generation','editing','production'],
   array['Text to video','Image to video','Camera controls','Inpainting','Green screen','Motion brush'],
   array['Web','iOS'],'admin_seed', now()),

  ('sora','Sora','OpenAI''s text to video model.','OpenAI''s video generation model, producing clips from text or images with notably coherent motion and scene consistency, available through a dedicated app and to paid ChatGPT subscribers.','https://openai.com/sora','Included with paid ChatGPT plans, subject to usage limits.','paid',
   array['video','generation','openai'],
   array['Text to video','Image to video','Scene extension','Remix','Storyboard'],
   array['Web','iOS'],'admin_seed', now()),

  ('kling','Kling','Video generation with strong motion realism.','A video generation model from Kuaishou, known for realistic physical motion and longer clip lengths, with both text to video and image to video modes.','https://klingai.com','Free daily credits. Paid subscription plans.','freemium',
   array['video','generation','motion'],
   array['Text to video','Image to video','Motion brush','Lip sync','Extended clips'],
   array['Web'],'admin_seed', now()),

  ('pika','Pika','Fast, playful video generation.','A video generator aimed at short, shareable clips, with effects that manipulate objects in a scene and a fast turnaround suited to social content.','https://pika.art','Free tier with credits. Paid subscription plans.','freemium',
   array['video','generation','social'],
   array['Text to video','Image to video','Video effects','Lip sync','Sound effects'],
   array['Web','iOS'],'admin_seed', now()),

  ('luma-dream-machine','Dream Machine','Video and 3D generation from Luma.','Luma Labs'' video generation product, with text and image to video plus camera motion control, alongside their work on 3D capture and reconstruction.','https://lumalabs.ai/dream-machine','Free tier with limits. Paid subscription plans.','freemium',
   array['video','generation','3d','luma'],
   array['Text to video','Image to video','Camera motion','Keyframes','Video extension'],
   array['Web','iOS'],'admin_seed', now()),

  ('heygen','HeyGen','AI avatars and video translation.','Generates presenter style video from a script using AI avatars, including custom avatars of a real person, and translates existing video into other languages with matched lip movement.','https://www.heygen.com','Free tier with limits. Paid subscription and enterprise plans.','freemium',
   array['video','avatar','translation','marketing'],
   array['AI avatars','Custom avatar cloning','Video translation','Lip sync','Script to video','API'],
   array['Web','API'],'admin_seed', now()),

  ('synthesia','Synthesia','Enterprise video from scripts with AI presenters.','An enterprise focused platform for turning scripts and documents into presenter led video, widely used for training and internal communication, with a large avatar and language library.','https://www.synthesia.io','Free trial. Paid subscription and enterprise plans.','paid',
   array['video','avatar','enterprise','training'],
   array['AI presenters','Many languages','Templates','Screen recording','Brand kits','Collaboration'],
   array['Web'],'admin_seed', now()),

  ('descript','Descript','Edit video and audio by editing the transcript.','An editor that transcribes your recording and lets you cut the video by deleting words. Includes filler word removal, studio sound, eye contact correction and a voice clone.','https://www.descript.com','Free tier with limits. Paid subscription plans.','freemium',
   array['video','audio','editing','podcast','transcription'],
   array['Transcript based editing','Filler word removal','Studio sound','Overdub voice clone','Screen recording','Multitrack'],
   array['macOS','Windows','Web'],'admin_seed', now()),

  ('elevenlabs','ElevenLabs','Text to speech and voice cloning.','A speech platform known for natural sounding text to speech, voice cloning from short samples, dubbing into other languages and sound effect generation. Widely used for audiobooks and video narration.','https://elevenlabs.io','Free tier with monthly characters. Paid subscription and usage based API.','freemium',
   array['voice-and-audio','tts','voice-cloning','dubbing'],
   array['Text to speech','Voice cloning','Dubbing','Sound effects','Speech to text','API'],
   array['Web','API','iOS','Android'],'admin_seed', now()),

  ('suno','Suno','Generates complete songs from a prompt.','Produces full songs, vocals and instrumentation together, from a text prompt or your own lyrics. Used for demos, background music and social content.','https://suno.com','Free daily credits. Paid subscription plans.','freemium',
   array['voice-and-audio','music','generation','songs'],
   array['Text to song','Custom lyrics','Style control','Stem separation','Song extension'],
   array['Web','iOS','Android'],'admin_seed', now()),

  ('udio','Udio','Music generation with fine control over style.','A music generation tool aimed at higher fidelity output and more granular control over structure, style and instrumentation than a single prompt allows.','https://www.udio.com','Free monthly credits. Paid subscription plans.','freemium',
   array['voice-and-audio','music','generation'],
   array['Text to music','Style prompts','Section editing','Track extension','Stem downloads'],
   array['Web'],'admin_seed', now()),

  ('assemblyai','AssemblyAI','Speech to text API for developers.','A developer focused speech API offering transcription, speaker diarisation, sentiment and summarisation, aimed at applications rather than at end users.','https://www.assemblyai.com','Free credits to start. Usage based pricing per hour of audio.','freemium',
   array['voice-and-audio','transcription','api','developer'],
   array['Speech to text','Speaker diarisation','Real time streaming','Summarisation','Content moderation','Many languages'],
   array['API'],'admin_seed', now()),

  ('murf','Murf','Voiceover generation for business content.','A voiceover tool aimed at business users, with a studio for timing narration against slides or video, plus voice cloning and multi language output.','https://murf.ai','Free tier with limits. Paid subscription plans.','freemium',
   array['voice-and-audio','tts','voiceover','business'],
   array['Text to speech','Voice cloning','Studio timing','Many languages','Video sync','API'],
   array['Web','API'],'admin_seed', now()),

  ('perplexity','Perplexity','Answer engine that cites its sources.','A search product that answers questions directly and cites the pages it used, with follow up questions, focused search modes and a deeper research mode for longer reports.','https://www.perplexity.ai','Free tier available. Paid subscription and a usage based API.','freemium',
   array['search-and-research','answer-engine','citations'],
   array['Cited answers','Follow up questions','Focus modes','Deep research','File upload','API'],
   array['Web','iOS','Android','macOS','Windows'],'admin_seed', now()),

  ('exa','Exa','Search API built for AI applications.','A search API designed to be called by AI systems rather than read by people, returning full page content and semantic matches suited to retrieval augmented generation.','https://exa.ai','Free credits to start. Usage based pricing per search.','freemium',
   array['search-and-research','api','rag','developer'],
   array['Semantic search','Full page contents','Similar page search','Structured answers','RAG ready output'],
   array['API'],'admin_seed', now()),

  ('tavily','Tavily','Web search API for agents and RAG.','A search API built for agents, returning cleaned and ranked results with an optional short answer, designed to be dropped into a retrieval pipeline.','https://tavily.com','Free monthly credits. Usage based pricing.','freemium',
   array['search-and-research','api','agents','rag'],
   array['Agent optimised search','Content extraction','Short answers','Topic filters','Domain filters'],
   array['API'],'admin_seed', now()),

  ('serper','Serper','Fast Google search results API.','A low latency API that returns Google search results as structured JSON, commonly used to give AI applications access to live web results at low cost.','https://serper.dev','Free credits to start. Usage based pricing per query.','freemium',
   array['search-and-research','api','google','developer'],
   array['Google results as JSON','Low latency','News and image search','Places search','High free tier'],
   array['API'],'admin_seed', now()),

  ('notebooklm','NotebookLM','Research assistant grounded in your own documents.','Google''s research tool that answers only from the sources you upload, with citations back to the exact passage, plus generated audio overviews that summarise a set of documents as a conversation.','https://notebooklm.google.com','Free tier available. Paid tiers through Google One and Workspace.','freemium',
   array['search-and-research','documents','grounded','google'],
   array['Grounded in your sources','Inline citations','Audio overviews','Mind maps','Source summaries'],
   array['Web','iOS','Android'],'admin_seed', now()),

  ('elicit','Elicit','Research assistant for academic papers.','A research tool that searches academic literature, extracts findings into structured tables and summarises across many papers, aimed at systematic reviews.','https://elicit.com','Free tier with limits. Paid subscription plans.','freemium',
   array['search-and-research','academic','papers','science'],
   array['Paper search','Data extraction tables','Systematic review support','Summarisation across papers','Citation export'],
   array['Web'],'admin_seed', now()),

  ('consensus','Consensus','Search engine over peer reviewed research.','A search engine that answers questions using findings from peer reviewed papers, showing how much of the literature agrees, aimed at evidence based answers rather than opinion.','https://consensus.app','Free tier with limits. Paid subscription plans.','freemium',
   array['search-and-research','academic','evidence','science'],
   array['Evidence based answers','Consensus meter','Study quality signals','Citation links','Paper summaries'],
   array['Web','iOS'],'admin_seed', now()),

  ('n8n','n8n','Source available workflow automation you can self host.','A workflow automation tool with a visual node editor, hundreds of integrations and first class AI agent nodes. Source available and self hostable, which makes it common where data cannot leave your own infrastructure.','https://n8n.io','Free to self host. Paid cloud plans by workflow executions.','freemium',
   array['automation','workflows','self-hosted','agents'],
   array['Visual workflow editor','Hundreds of integrations','AI agent nodes','Self hosting','Custom code steps','Webhooks'],
   array['Web','Self hosted'],'admin_seed', now()),

  ('zapier','Zapier','Connects thousands of apps without code.','The longest established no code automation platform, connecting a very large catalogue of business applications, with AI steps and agents added on top of its trigger and action model.','https://zapier.com','Free tier with limited tasks. Paid plans by task volume.','freemium',
   array['automation','no-code','integrations','business'],
   array['Thousands of app integrations','Multi step workflows','AI agents','Tables and interfaces','Filters and paths'],
   array['Web'],'admin_seed', now()),

  ('make','Make','Visual automation with fine grained control.','A visual automation platform whose scenario editor exposes more of the data flow than most no code tools, which suits branching, iteration and complex transformations.','https://www.make.com','Free tier with monthly operations. Paid plans by operation volume.','freemium',
   array['automation','no-code','visual','integrations'],
   array['Visual scenario builder','Data mapping','Error handlers','Iterators and aggregators','Scheduling','AI modules'],
   array['Web'],'admin_seed', now()),

  ('dify','Dify','Open source platform for building LLM applications.','An open source platform for building and operating LLM applications, combining a visual workflow builder, RAG pipelines, agent tools and observability in one self hostable package.','https://dify.ai','Free and open source, self hosted. Paid cloud plans.','freemium',
   array['automation','llm-ops','open-source','rag','agents'],
   array['Visual workflow builder','RAG pipelines','Agent tools','Prompt management','Observability','Self hosting'],
   array['Web','Self hosted','API'],'admin_seed', now()),

  ('crewai','CrewAI','Framework for multi agent AI systems.','A Python framework for orchestrating multiple AI agents with defined roles that collaborate on a task, with tools, delegation and sequential or hierarchical processes.','https://www.crewai.com','Open source framework, free. Paid managed platform.','freemium',
   array['automation','agents','framework','python','multi-agent'],
   array['Role based agents','Task delegation','Tool use','Sequential and hierarchical flows','Open source'],
   array['Python','Self hosted','Web'],'admin_seed', now()),

  ('langchain','LangChain','Framework for building applications on language models.','A widely used framework for composing LLM applications, with abstractions for prompts, retrieval, memory and agents, plus LangGraph for stateful multi step workflows.','https://www.langchain.com','Open source framework, free. Paid plans for LangSmith and hosted services.','freemium',
   array['automation','framework','developer','rag','agents'],
   array['Model abstraction','Retrieval pipelines','Agent tooling','LangGraph state machines','Many integrations'],
   array['Python','JavaScript','Self hosted'],'admin_seed', now()),

  ('langsmith','LangSmith','Tracing and evaluation for LLM applications.','An observability platform for LLM applications, recording every call in a trace, comparing prompt versions and running evaluations against datasets. The answer to not knowing why an AI feature behaved the way it did.','https://www.langchain.com/langsmith','Free developer tier. Paid plans by trace volume.','freemium',
   array['automation','observability','evaluation','developer','llm-ops'],
   array['Request tracing','Prompt versioning','Dataset evaluation','Cost and latency tracking','Human feedback'],
   array['Web','API'],'admin_seed', now()),

  ('supabase','Supabase','Open source Postgres backend with auth and storage.','A backend platform built on Postgres, providing authentication, row level security, storage, edge functions, realtime subscriptions and a vector store, all against a database you can take with you.','https://supabase.com','Generous free tier. Paid plans by project and usage.','freemium',
   array['backend-and-data','postgres','auth','vector','open-source'],
   array['Postgres database','Authentication','Row level security','Storage','Edge functions','Realtime','pgvector'],
   array['Web','API','Self hosted'],'admin_seed', now()),

  ('pinecone','Pinecone','Managed vector database for semantic search.','A managed vector database built for low latency similarity search at scale, with metadata filtering and namespaces, commonly used as the retrieval layer for RAG systems.','https://www.pinecone.io','Free starter tier. Usage based paid plans.','freemium',
   array['backend-and-data','vector-db','rag','managed'],
   array['Vector search','Metadata filtering','Namespaces','Serverless indexes','Hybrid search'],
   array['API'],'admin_seed', now()),

  ('qdrant','Qdrant','Open source vector database written in Rust.','An open source vector database focused on performance and rich filtering, self hostable or managed, with quantisation options that cut memory use substantially.','https://qdrant.tech','Free and open source, self hosted. Paid managed cloud.','freemium',
   array['backend-and-data','vector-db','open-source','rust','rag'],
   array['Vector search','Rich payload filtering','Quantisation','Hybrid search','Self hosting','Snapshots'],
   array['API','Self hosted','Docker'],'admin_seed', now()),

  ('weaviate','Weaviate','Open source vector database with built in vectorisation.','An open source vector database that can generate embeddings itself through module integrations, supports hybrid keyword and vector search, and offers generative search that feeds results straight to a model.','https://weaviate.io','Free and open source, self hosted. Paid managed cloud.','freemium',
   array['backend-and-data','vector-db','open-source','hybrid-search','rag'],
   array['Vector search','Built in vectorisation','Hybrid search','Generative search','Multi tenancy','Self hosting'],
   array['API','Self hosted','Docker'],'admin_seed', now()),

  ('chroma','Chroma','Embedding database that runs in your application.','An open source embedding database designed to be easy to start with, running in process for local development and as a server for production, popular for prototypes and small RAG systems.','https://www.trychroma.com','Free and open source. Paid managed cloud.','freemium',
   array['backend-and-data','vector-db','open-source','rag','local'],
   array['In process mode','Server mode','Metadata filtering','Simple API','Python and JavaScript clients'],
   array['Python','JavaScript','Self hosted'],'admin_seed', now()),

  ('neon','Neon','Serverless Postgres with database branching.','A serverless Postgres platform that separates storage from compute, so databases scale to zero and can be branched like code for each preview deployment. Supports pgvector for embeddings.','https://neon.com','Free tier available. Paid plans by compute and storage.','freemium',
   array['backend-and-data','postgres','serverless','branching'],
   array['Serverless Postgres','Database branching','Scale to zero','Point in time restore','pgvector'],
   array['Web','API'],'admin_seed', now()),

  ('upstash','Upstash','Serverless Redis and queues priced per request.','Serverless data services with an HTTP API, so they work from edge and serverless runtimes where a persistent TCP connection is not available. Priced per request, which suits bursty workloads and rate limiting.','https://upstash.com','Free tier with daily request limits. Usage based paid plans.','freemium',
   array['backend-and-data','redis','serverless','rate-limiting','edge'],
   array['Serverless Redis','HTTP and REST API','Rate limiting library','Queues and workflows','Vector database','Global replication'],
   array['API','Edge'],'admin_seed', now())
on conflict (slug) do nothing;

-- Derive tool_categories from the first tag, which is always the category slug.
insert into public.tool_categories (tool_id, category_id)
select t.id, c.id
from public.tools t
join public.categories c on c.slug = t.tags[1]::extensions.citext
on conflict do nothing;
