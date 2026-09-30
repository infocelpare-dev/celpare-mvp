/*
  A snapshot of the live catalogue, taken 2026-09-28 from project celpare for
  4BK's evaluation and tests. Real rows (approved tools and models, their
  compare_facts, cheapest monthly plan, evaluation counts); descriptions cut to
  240 characters. Test fixtures are included, tagged test-fixture, so the
  fixture rule can be tested. Regenerate when the catalogue changes materially.
*/

import type { EntityInput } from "../entity";

type Row = Omit<EntityInput, "listingQuality" | "listingPenalty"> & { type: "tool" | "model" };

export const CATALOGUE_SNAPSHOT: Row[] = [
 {
  "type": "model",
  "id": "e449083c-eac1-498b-8a51-3b653c8c5d3b",
  "slug": "claude-fable-5-1",
  "name": "Claude Fable 5.1",
  "description": "Improves on Claude Fable 5 across the board, with the biggest gains in agentic coding, long running agentic workflows and knowledge work.",
  "tags": [
   "reasoning",
   "coding",
   "agents"
  ],
  "provider": "Anthropic",
  "family": "Claude",
  "contextWindow": 1000000,
  "maxOutput": 128000,
  "inputPrice": 10,
  "outputPrice": 50,
  "modalities": [
   "text",
   "image",
   "file"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:54:23.386056+00:00",
  "evaluations": 9,
  "verifiedEvaluations": 9,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "6bbd2d4a-ebe6-49be-b3f6-8accdfa231dc",
  "slug": "claude-opus-4-1",
  "name": "Claude Opus 4.1",
  "description": "The most capable Claude tier, for hard reasoning and long agentic runs.",
  "tags": [
   "test-fixture",
   "reasoning"
  ],
  "provider": "Anthropic",
  "family": null,
  "contextWindow": 200000,
  "maxOutput": null,
  "inputPrice": 15,
  "outputPrice": 75,
  "modalities": [
   "text",
   "image"
  ],
  "outputModalities": [],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-08-29T16:54:08.900292+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": []
 },
 {
  "type": "model",
  "id": "54a3f9f2-bb61-45ed-a516-406677ba2100",
  "slug": "claude-opus-5",
  "name": "Claude Opus 5",
  "description": "Anthropic's previous flagship for demanding reasoning, coding and long running agentic work, succeeded by Opus 5.5.",
  "tags": [
   "reasoning",
   "coding",
   "agents"
  ],
  "provider": "Anthropic",
  "family": "Claude",
  "contextWindow": 1000000,
  "maxOutput": 128000,
  "inputPrice": 5,
  "outputPrice": 25,
  "modalities": [
   "text",
   "image",
   "file"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:54:23.386056+00:00",
  "evaluations": 9,
  "verifiedEvaluations": 9,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "1afb676a-3e00-40f7-8349-762485079a3e",
  "slug": "claude-opus-5-5",
  "name": "Claude Opus 5.5",
  "description": "Anthropic's flagship model for demanding reasoning, coding and long running agentic work. Succeeds Claude Opus 5.",
  "tags": [
   "reasoning",
   "coding",
   "agents"
  ],
  "provider": "Anthropic",
  "family": "Claude",
  "contextWindow": 1000000,
  "maxOutput": 128000,
  "inputPrice": 4,
  "outputPrice": 20,
  "modalities": [
   "text",
   "image",
   "file"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:02:17.522796+00:00",
  "evaluations": 9,
  "verifiedEvaluations": 9,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "5027dbe8-0d0d-4120-a5dd-0992cce36a4f",
  "slug": "claude-sonnet-4-5",
  "name": "Claude Sonnet 4.5",
  "description": "Balanced Claude model for coding, agents and long context work.",
  "tags": [
   "test-fixture",
   "reasoning",
   "coding"
  ],
  "provider": "Anthropic",
  "family": null,
  "contextWindow": 200000,
  "maxOutput": null,
  "inputPrice": 3,
  "outputPrice": 15,
  "modalities": [
   "text",
   "image"
  ],
  "outputModalities": [],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-08-23T16:54:08.900292+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": []
 },
 {
  "type": "model",
  "id": "99bfe56b-c039-4307-9651-b1c933e37dec",
  "slug": "claude-sonnet-5",
  "name": "Claude Sonnet 5",
  "description": "Anthropic's most capable Sonnet class model, for coding, agents and professional work, with selectable reasoning effort.",
  "tags": [
   "reasoning",
   "coding",
   "agents"
  ],
  "provider": "Anthropic",
  "family": "Claude",
  "contextWindow": 1000000,
  "maxOutput": 128000,
  "inputPrice": 2,
  "outputPrice": 10,
  "modalities": [
   "text",
   "image",
   "file"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:02:17.522796+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "93108ad4-857c-4b5f-b798-a609627c6c85",
  "slug": "deepseek-r1",
  "name": "DeepSeek R1",
  "description": "Open weights reasoning model that shows its chain of thought.",
  "tags": [
   "test-fixture",
   "reasoning",
   "open-weights"
  ],
  "provider": "DeepSeek",
  "family": null,
  "contextWindow": 65536,
  "maxOutput": null,
  "inputPrice": null,
  "outputPrice": null,
  "modalities": [
   "text"
  ],
  "outputModalities": [],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-17T16:54:08.900292+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": []
 },
 {
  "type": "model",
  "id": "575dfda4-3986-421c-a304-cd9d848467a5",
  "slug": "deepseek-v4-1-flash",
  "name": "DeepSeek V4.1 Flash",
  "description": "A sparse mixture of experts model from DeepSeek, the first on its Causal Encoder Decoder architecture. Weights published on Hugging Face.",
  "tags": [
   "open-weights",
   "budget"
  ],
  "provider": "DeepSeek",
  "family": "DeepSeek V4",
  "contextWindow": 1048576,
  "maxOutput": 943718,
  "inputPrice": 0.1,
  "outputPrice": 0.5,
  "modalities": [
   "text",
   "image"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": true,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:02:17.522796+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "5d9a6aea-0d00-4950-83a0-60d93aa202fa",
  "slug": "gemini-2-5-pro",
  "name": "Gemini 2.5 Pro",
  "description": "Long context multimodal model, up to a million tokens.",
  "tags": [
   "test-fixture",
   "long-context",
   "multimodal"
  ],
  "provider": "Google",
  "family": null,
  "contextWindow": 1048576,
  "maxOutput": null,
  "inputPrice": null,
  "outputPrice": null,
  "modalities": [
   "text",
   "image",
   "audio",
   "video"
  ],
  "outputModalities": [],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-05T16:54:08.900292+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": []
 },
 {
  "type": "model",
  "id": "96d0a20e-7505-44c3-a845-0a47a71b848d",
  "slug": "gemini-3-8-flash",
  "name": "Gemini 3.8 Flash",
  "description": "Google's most capable Flash model, improved over 3.7 Flash in software engineering, agentic tasks and multi step reasoning.",
  "tags": [
   "multimodal",
   "long-context"
  ],
  "provider": "Google",
  "family": "Gemini",
  "contextWindow": 1048576,
  "maxOutput": 65536,
  "inputPrice": 0.75,
  "outputPrice": 3.75,
  "modalities": [
   "text",
   "image",
   "video",
   "file",
   "audio"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:02:17.522796+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "6d243f6b-7ed0-4c0a-97f6-7d82dafe63b1",
  "slug": "gpt-4o",
  "name": "GPT-4o",
  "description": "Multimodal OpenAI model handling text, image and audio in one.",
  "tags": [
   "test-fixture",
   "multimodal"
  ],
  "provider": "OpenAI",
  "family": null,
  "contextWindow": 128000,
  "maxOutput": null,
  "inputPrice": null,
  "outputPrice": null,
  "modalities": [
   "text",
   "image",
   "audio"
  ],
  "outputModalities": [],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-01T16:54:08.900292+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": []
 },
 {
  "type": "model",
  "id": "8bfdbf26-d558-4ddb-a19e-7e536ba573ac",
  "slug": "gpt-5-6-sol",
  "name": "GPT-5.6 Sol",
  "description": "The flagship of OpenAI's GPT-5.6 series, for complex reasoning, coding and agentic workflows.",
  "tags": [
   "reasoning",
   "coding"
  ],
  "provider": "OpenAI",
  "family": "GPT-5.6",
  "contextWindow": 1050000,
  "maxOutput": 128000,
  "inputPrice": 2,
  "outputPrice": 10,
  "modalities": [
   "text",
   "image",
   "file"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:54:23.386056+00:00",
  "evaluations": 6,
  "verifiedEvaluations": 6,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "9c450dd4-f18b-47ac-8ae7-a2ca7975b4f1",
  "slug": "gpt-6-astra",
  "name": "GPT-6 Astra",
  "description": "OpenAI's flagship GPT-6 model for demanding end to end work: analysis, software engineering, deep research and documents.",
  "tags": [
   "reasoning",
   "coding",
   "research"
  ],
  "provider": "OpenAI",
  "family": "GPT-6",
  "contextWindow": 1050000,
  "maxOutput": 128000,
  "inputPrice": 10,
  "outputPrice": 50,
  "modalities": [
   "text",
   "image",
   "file"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:02:17.522796+00:00",
  "evaluations": 6,
  "verifiedEvaluations": 6,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "39e18646-a193-49e8-b494-cd7906f907a5",
  "slug": "gpt-6-sol",
  "name": "GPT-6 Sol",
  "description": "The cost efficient high end model in OpenAI's GPT-6 series, between the flagship Astra and the fast Luna tier.",
  "tags": [
   "reasoning",
   "coding"
  ],
  "provider": "OpenAI",
  "family": "GPT-6",
  "contextWindow": 1050000,
  "maxOutput": 128000,
  "inputPrice": 2,
  "outputPrice": 10,
  "modalities": [
   "text",
   "image",
   "file"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:02:17.522796+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "batch_processing",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "3750c75f-c045-49b4-8f18-fdfa5475ba54",
  "slug": "grok-4-7",
  "name": "Grok 4.7",
  "description": "SpaceXAI's flagship model for coding, agentic tasks and knowledge work. Succeeds Grok 4.6.",
  "tags": [
   "reasoning",
   "coding"
  ],
  "provider": "SpaceXAI",
  "family": "Grok 4",
  "contextWindow": 500000,
  "maxOutput": 450000,
  "inputPrice": 1.6,
  "outputPrice": 4.8,
  "modalities": [
   "text",
   "image",
   "file"
  ],
  "outputModalities": [
   "text"
  ],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-23T09:02:17.522796+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": [
   {
    "attribute": "reasoning",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "tool_calling",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "structured_outputs",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "vision",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "audio_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "video_input",
    "flag": false,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "OpenRouter model listing"
   },
   {
    "attribute": "deploy_providers",
    "flag": null,
    "text": "OpenRouter",
    "number": null,
    "source": "OpenRouter model listing"
   }
  ]
 },
 {
  "type": "model",
  "id": "bed96949-5e82-4512-8727-5286d82e1e02",
  "slug": "llama-3-3-70b",
  "name": "Llama 3.3 70B",
  "description": "Open weights instruction tuned model you can host yourself.",
  "tags": [
   "test-fixture",
   "open-weights"
  ],
  "provider": "Meta",
  "family": null,
  "contextWindow": 131072,
  "maxOutput": null,
  "inputPrice": null,
  "outputPrice": null,
  "modalities": [
   "text"
  ],
  "outputModalities": [],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-10T16:54:08.900292+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": []
 },
 {
  "type": "model",
  "id": "26c14fc2-9a43-4ef1-a488-53813eb48511",
  "slug": "mistral-large",
  "name": "Mistral Large",
  "description": "European built flagship model with strong multilingual coverage.",
  "tags": [
   "test-fixture",
   "multilingual"
  ],
  "provider": "Mistral AI",
  "family": null,
  "contextWindow": 131072,
  "maxOutput": null,
  "inputPrice": null,
  "outputPrice": null,
  "modalities": [
   "text"
  ],
  "outputModalities": [],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-13T16:54:08.900292+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": []
 },
 {
  "type": "model",
  "id": "7b964070-29a3-40e8-80a9-2e24abac1c4e",
  "slug": "whisper-large-v3",
  "name": "Whisper large-v3",
  "description": "Speech to text model covering a wide range of languages.",
  "tags": [
   "test-fixture",
   "speech"
  ],
  "provider": "OpenAI",
  "family": null,
  "contextWindow": null,
  "maxOutput": null,
  "inputPrice": null,
  "outputPrice": null,
  "modalities": [
   "audio",
   "text"
  ],
  "outputModalities": [],
  "openWeights": null,
  "lifecycle": null,
  "createdAt": "2026-09-21T16:54:08.900292+00:00",
  "evaluations": 0,
  "verifiedEvaluations": 0,
  "facts": []
 },
 {
  "type": "tool",
  "id": "781f3bca-8593-44b0-8b87-79f763da7c61",
  "slug": "adobe-firefly",
  "name": "Adobe Firefly",
  "tagline": "Image generation trained for commercial safety.",
  "description": "Adobe's generative image family, trained on licensed and public domain content and designed for commercial use, with deep integration into Photoshop and the rest of Creative Cloud.",
  "tags": [
   "image-generation",
   "adobe",
   "commercial",
   "design"
  ],
  "features": [
   "Text to image",
   "Generative fill",
   "Generative expand",
   "Photoshop integration",
   "Commercially safe training data"
  ],
  "platforms": [
   "Web",
   "Photoshop",
   "Illustrator"
  ],
  "categories": [
   "Image generation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "firefly.adobe.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "3c2d19ea-0b45-4bdb-a465-718c985a8e4b",
  "slug": "assemblyai",
  "name": "AssemblyAI",
  "tagline": "Speech to text API for developers.",
  "description": "A developer focused speech API offering transcription, speaker diarisation, sentiment and summarisation, aimed at applications rather than at end users.",
  "tags": [
   "voice-and-audio",
   "transcription",
   "api",
   "developer"
  ],
  "features": [
   "Speech to text",
   "Speaker diarisation",
   "Real time streaming",
   "Summarisation",
   "Content moderation",
   "Many languages"
  ],
  "platforms": [
   "API"
  ],
  "categories": [
   "Voice and audio"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "assemblyai.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "f59c69f2-8043-49a8-ab37-155e15bd1955",
  "slug": "bolt-new",
  "name": "Bolt",
  "tagline": "Builds and runs full stack apps in the browser.",
  "description": "Prompt to full stack application, running entirely in the browser via WebContainers. Installs packages, runs a dev server and deploys, with no local setup.",
  "tags": [
   "coding",
   "fullstack",
   "browser",
   "generation"
  ],
  "features": [
   "Prompt to app",
   "Runs in browser",
   "Package installation",
   "Live preview",
   "One click deploy"
  ],
  "platforms": [
   "Web"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "bolt.new",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "082c5306-2ac3-418c-8e84-51c036b01d0f",
  "slug": "celpare-test-tool",
  "name": "Celpare Test Tool",
  "tagline": "A throwaway draft used to verify the submit form.",
  "description": "....",
  "tags": [],
  "features": [],
  "platforms": [],
  "categories": [],
  "pricingModel": null,
  "cheapestPlanUsd": null,
  "canonicalDomain": "celpare.example",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-16T13:31:52.250904+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "fb0bfd42-7c4a-45dd-a4b1-0b12be4833bf",
  "slug": "chatgpt",
  "name": "ChatGPT",
  "tagline": "General purpose AI assistant from OpenAI.",
  "description": "A conversational assistant built on OpenAI models, with image understanding, file analysis, web browsing, image generation and custom GPTs. The most widely used consumer AI product, and the default starting point for most people.",
  "tags": [
   "chat-and-reasoning",
   "assistant",
   "openai",
   "general"
  ],
  "features": [
   "Conversational chat",
   "Image understanding",
   "File analysis",
   "Web browsing",
   "Image generation",
   "Custom GPTs",
   "Voice mode"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android",
   "macOS",
   "Windows"
  ],
  "categories": [
   "Chat and reasoning"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "chat.openai.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "911d08a2-4ab3-47b4-b633-93ccf2e5882a",
  "slug": "chroma",
  "name": "Chroma",
  "tagline": "Embedding database that runs in your application.",
  "description": "An open source embedding database designed to be easy to start with, running in process for local development and as a server for production, popular for prototypes and small RAG systems.",
  "tags": [
   "backend-and-data",
   "vector-db",
   "open-source",
   "rag",
   "local"
  ],
  "features": [
   "In process mode",
   "Server mode",
   "Metadata filtering",
   "Simple API",
   "Python and JavaScript clients"
  ],
  "platforms": [
   "Python",
   "JavaScript",
   "Self hosted"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "trychroma.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "c86687ec-da2b-45c7-919e-f4592b216804",
  "slug": "clau",
  "name": "clau",
  "tagline": "A throwaway draft used to verify the submit form.",
  "description": ",,,,",
  "tags": [
   "#hby"
  ],
  "features": [],
  "platforms": [],
  "categories": [
   "Automation",
   "Chat and reasoning"
  ],
  "pricingModel": null,
  "cheapestPlanUsd": null,
  "canonicalDomain": "celpare.example",
  "rating": 3,
  "ratingCount": 1,
  "verified": false,
  "createdAt": "2026-09-17T18:31:54.93923+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "3fcbe299-4677-403e-890d-dd99de016576",
  "slug": "claude",
  "name": "Claude",
  "tagline": "AI assistant from Anthropic, strong at long documents and code.",
  "description": "Claude is Anthropic's AI assistant. It is built around long context, so it holds whole documents, codebases and long conversations in mind at once rather than losing the thread halfway through.\n\nWhat people use it for: reading and drafting ",
  "tags": [
   "chat-and-reasoning",
   "assistant",
   "anthropic",
   "writing",
   "long-context"
  ],
  "features": [
   "Long context",
   "Artifacts",
   "Projects",
   "File analysis",
   "Code generation",
   "Connectors"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android",
   "macOS",
   "Windows"
  ],
  "categories": [
   "Chat and reasoning"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": 20,
  "canonicalDomain": "claude.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": [
   {
    "attribute": "trains_on_user_data",
    "flag": null,
    "text": "Not by default on Team plans",
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "enterprise_controls",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "integration_microsoft",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "collaboration",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "automation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "agents",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "code_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "file_analysis",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "web_search",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   },
   {
    "attribute": "text_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Claude pricing page"
   }
  ]
 },
 {
  "type": "tool",
  "id": "64ddbcce-4a9f-45f3-9b49-2584384ae567",
  "slug": "claude-code",
  "name": "Claude Code",
  "tagline": "Anthropic's agentic coding tool for the terminal.",
  "description": "A command line coding agent that reads, writes and runs code in a real repository, executes shell commands and git operations, and works across multi step tasks. Also available in the IDE and on the web.",
  "tags": [
   "coding",
   "agent",
   "terminal",
   "cli"
  ],
  "features": [
   "Repository wide edits",
   "Runs shell commands",
   "Git and GitHub operations",
   "MCP servers",
   "Subagents",
   "Hooks"
  ],
  "platforms": [
   "macOS",
   "Windows",
   "Linux",
   "VS Code",
   "JetBrains",
   "Web"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "paid",
  "cheapestPlanUsd": null,
  "canonicalDomain": "anthropic.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "00844780-67e0-4a23-a36c-229e61dc7e5d",
  "slug": "cline",
  "name": "Cline",
  "tagline": "Open source autonomous coding agent for VS Code.",
  "description": "An open source VS Code extension that runs an autonomous coding agent against your repository, with explicit approval for each file change and command. Bring your own API key.",
  "tags": [
   "coding",
   "agent",
   "open-source",
   "vscode"
  ],
  "features": [
   "Autonomous edits",
   "Step approval",
   "Bring your own key",
   "Terminal execution",
   "MCP support"
  ],
  "platforms": [
   "VS Code"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "free",
  "cheapestPlanUsd": null,
  "canonicalDomain": "cline.bot",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "edea8933-c9cd-4dc2-9b51-1f558a0d2d81",
  "slug": "consensus",
  "name": "Consensus",
  "tagline": "Search engine over peer reviewed research.",
  "description": "A search engine that answers questions using findings from peer reviewed papers, showing how much of the literature agrees, aimed at evidence based answers rather than opinion.",
  "tags": [
   "search-and-research",
   "academic",
   "evidence",
   "science"
  ],
  "features": [
   "Evidence based answers",
   "Consensus meter",
   "Study quality signals",
   "Citation links",
   "Paper summaries"
  ],
  "platforms": [
   "Web",
   "iOS"
  ],
  "categories": [
   "Search and research"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "consensus.app",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "40046695-f5fb-470a-a956-4b4ef665f140",
  "slug": "crewai",
  "name": "CrewAI",
  "tagline": "Framework for multi agent AI systems.",
  "description": "A Python framework for orchestrating multiple AI agents with defined roles that collaborate on a task, with tools, delegation and sequential or hierarchical processes.",
  "tags": [
   "automation",
   "agents",
   "framework",
   "python",
   "multi-agent"
  ],
  "features": [
   "Role based agents",
   "Task delegation",
   "Tool use",
   "Sequential and hierarchical flows",
   "Open source"
  ],
  "platforms": [
   "Python",
   "Self hosted",
   "Web"
  ],
  "categories": [
   "Automation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "crewai.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "a1bdf9b2-259f-425c-827f-fd5eb1534c9c",
  "slug": "cursor",
  "name": "Cursor",
  "tagline": "AI first code editor built on VS Code.",
  "description": "A fork of VS Code built around AI editing. Understands the whole repository, applies multi file edits, and runs an agent mode that can plan and execute changes across a codebase.",
  "tags": [
   "coding",
   "editor",
   "ide",
   "agent"
  ],
  "features": [
   "Codebase aware chat",
   "Multi file edits",
   "Agent mode",
   "Tab completion",
   "Terminal integration",
   "VS Code extensions"
  ],
  "platforms": [
   "macOS",
   "Windows",
   "Linux"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": 20,
  "canonicalDomain": "cursor.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": [
   {
    "attribute": "certifications",
    "flag": null,
    "text": "AIUC-1",
    "number": null,
    "source": "Cursor pricing page"
   },
   {
    "attribute": "certifications",
    "flag": null,
    "text": "ISO 42001",
    "number": null,
    "source": "Cursor pricing page"
   },
   {
    "attribute": "certifications",
    "flag": null,
    "text": "ISO 27001",
    "number": null,
    "source": "Cursor pricing page"
   },
   {
    "attribute": "certifications",
    "flag": null,
    "text": "SOC 2",
    "number": null,
    "source": "Cursor pricing page"
   },
   {
    "attribute": "trains_on_user_data",
    "flag": null,
    "text": "Not with privacy mode on",
    "number": null,
    "source": "Cursor pricing page"
   },
   {
    "attribute": "enterprise_controls",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Cursor pricing page"
   },
   {
    "attribute": "collaboration",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Cursor pricing page"
   },
   {
    "attribute": "agents",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Cursor pricing page"
   },
   {
    "attribute": "code_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Cursor pricing page"
   }
  ]
 },
 {
  "type": "tool",
  "id": "f7dba1a2-b4f0-405f-9664-7bd92a59439e",
  "slug": "deepseek",
  "name": "DeepSeek",
  "tagline": "Open weight reasoning models with low cost API access.",
  "description": "A Chinese AI lab publishing open weight models with strong reasoning and coding performance at notably low API prices. Popular where cost per token is the deciding factor, and where self hosting matters.",
  "tags": [
   "chat-and-reasoning",
   "open-weights",
   "reasoning",
   "low-cost"
  ],
  "features": [
   "Reasoning models",
   "Open weights",
   "Low cost API",
   "Self hostable",
   "Code models"
  ],
  "platforms": [
   "Web",
   "API",
   "Self hosted"
  ],
  "categories": [
   "Chat and reasoning"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "deepseek.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "afba56d8-690a-4fda-8dd7-bb7d4f3b5651",
  "slug": "descript",
  "name": "Descript",
  "tagline": "Edit video and audio by editing the transcript.",
  "description": "An editor that transcribes your recording and lets you cut the video by deleting words. Includes filler word removal, studio sound, eye contact correction and a voice clone.",
  "tags": [
   "video",
   "audio",
   "editing",
   "podcast",
   "transcription"
  ],
  "features": [
   "Transcript based editing",
   "Filler word removal",
   "Studio sound",
   "Overdub voice clone",
   "Screen recording",
   "Multitrack"
  ],
  "platforms": [
   "macOS",
   "Windows",
   "Web"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "descript.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "1d115188-71dd-47ed-bf87-7d39f581c6e5",
  "slug": "dify",
  "name": "Dify",
  "tagline": "Open source platform for building LLM applications.",
  "description": "An open source platform for building and operating LLM applications, combining a visual workflow builder, RAG pipelines, agent tools and observability in one self hostable package.",
  "tags": [
   "automation",
   "llm-ops",
   "open-source",
   "rag",
   "agents"
  ],
  "features": [
   "Visual workflow builder",
   "RAG pipelines",
   "Agent tools",
   "Prompt management",
   "Observability",
   "Self hosting"
  ],
  "platforms": [
   "Web",
   "Self hosted",
   "API"
  ],
  "categories": [
   "Automation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "dify.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "167de70d-0630-48b4-85be-af07fece583e",
  "slug": "elevenlabs",
  "name": "ElevenLabs",
  "tagline": "Text to speech and voice cloning.",
  "description": "A speech platform known for natural sounding text to speech, voice cloning from short samples, dubbing into other languages and sound effect generation. Widely used for audiobooks and video narration.",
  "tags": [
   "voice-and-audio",
   "tts",
   "voice-cloning",
   "dubbing"
  ],
  "features": [
   "Text to speech",
   "Voice cloning",
   "Dubbing",
   "Sound effects",
   "Speech to text",
   "API"
  ],
  "platforms": [
   "Web",
   "API",
   "iOS",
   "Android"
  ],
  "categories": [
   "Voice and audio"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "elevenlabs.io",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "fdd64ea7-3f7b-4953-9e2f-fe9da7c193bc",
  "slug": "exa",
  "name": "Exa",
  "tagline": "Search API built for AI applications.",
  "description": "A search API designed to be called by AI systems rather than read by people, returning full page content and semantic matches suited to retrieval augmented generation.",
  "tags": [
   "search-and-research",
   "api",
   "rag",
   "developer"
  ],
  "features": [
   "Semantic search",
   "Full page contents",
   "Similar page search",
   "Structured answers",
   "RAG ready output"
  ],
  "platforms": [
   "API"
  ],
  "categories": [
   "Search and research"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "exa.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "90c49f8c-c284-4f79-8f47-70ea3ce6b2bf",
  "slug": "flux",
  "name": "FLUX",
  "tagline": "Open weight image models from Black Forest Labs.",
  "description": "A family of image models from Black Forest Labs, available as open weights and through hosted APIs. Strong at prompt adherence and legible text inside images.",
  "tags": [
   "image-generation",
   "open-weights",
   "api"
  ],
  "features": [
   "Text to image",
   "Image editing",
   "Open weights",
   "Text rendering",
   "Hosted API"
  ],
  "platforms": [
   "API",
   "Self hosted",
   "Web"
  ],
  "categories": [
   "Image generation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "blackforestlabs.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "b8b69c6f-4aa8-4b0a-ac9b-b513e216bd6f",
  "slug": "framelift",
  "name": "FrameLift",
  "tagline": "Interpolation and upscaling for generated video.",
  "description": "Takes a short generated clip and raises the frame rate and resolution without the usual warping around fast motion.",
  "tags": [
   "test-fixture",
   "video"
  ],
  "features": [
   "Frame interpolation",
   "4x upscale",
   "Batch queue"
  ],
  "platforms": [
   "Web",
   "API"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": 12,
  "canonicalDomain": "example.com",
  "rating": 4,
  "ratingCount": 1,
  "verified": false,
  "createdAt": "2026-09-11T16:55:00.949605+00:00",
  "facts": [
   {
    "attribute": "video_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "automation",
    "flag": false,
    "text": null,
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "integration_slack",
    "flag": true,
    "text": null,
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "fit_video",
    "flag": null,
    "text": "strong",
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "strength",
    "flag": null,
    "text": "Batch queue for long renders",
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "limitation",
    "flag": null,
    "text": "Free plan exports carry a watermark",
    "number": null,
    "source": "TEST FIXTURE, not real data"
   }
  ]
 },
 {
  "type": "tool",
  "id": "adafec1f-bec1-4e1a-9d38-a53a6e87a12a",
  "slug": "gemini",
  "name": "Gemini",
  "tagline": "Google's multimodal AI assistant.",
  "description": "Google's assistant, natively multimodal across text, image, audio and video, with very large context windows and tight integration into Google Workspace, Search and Android.",
  "tags": [
   "chat-and-reasoning",
   "assistant",
   "google",
   "multimodal"
  ],
  "features": [
   "Multimodal input",
   "Very large context",
   "Google Workspace integration",
   "Image generation",
   "Deep research"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android"
  ],
  "categories": [
   "Chat and reasoning"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": 4.99,
  "canonicalDomain": "gemini.google.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": [
   {
    "attribute": "integration_google",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Google AI plans page"
   },
   {
    "attribute": "audio_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Google AI plans page"
   },
   {
    "attribute": "agents",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Google AI plans page"
   },
   {
    "attribute": "web_search",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Google AI plans page"
   },
   {
    "attribute": "video_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Google AI plans page"
   },
   {
    "attribute": "image_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Google AI plans page"
   },
   {
    "attribute": "text_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "Google AI plans page"
   }
  ]
 },
 {
  "type": "tool",
  "id": "b5d4a17d-7209-4791-91e5-c9be4b413499",
  "slug": "github-copilot",
  "name": "GitHub Copilot",
  "tagline": "AI pair programmer inside your editor.",
  "description": "GitHub's coding assistant, offering inline completion, chat and an agent mode, with deep integration into GitHub pull requests and issues. Works across most major editors.",
  "tags": [
   "coding",
   "completion",
   "github",
   "ide"
  ],
  "features": [
   "Inline completion",
   "Chat in editor",
   "Pull request summaries",
   "Agent mode",
   "Multiple model choice"
  ],
  "platforms": [
   "VS Code",
   "JetBrains",
   "Neovim",
   "Visual Studio",
   "Web"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "github.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "5cd8572c-0b06-4e20-bb58-37c017980195",
  "slug": "grok",
  "name": "Grok",
  "tagline": "xAI's assistant, integrated with X.",
  "description": "xAI's conversational assistant, with real time access to posts on X and a deliberately less filtered conversational style. Available in the X apps and as a standalone product.",
  "tags": [
   "chat-and-reasoning",
   "assistant",
   "xai",
   "realtime"
  ],
  "features": [
   "Real time X data",
   "Image understanding",
   "Image generation",
   "Web search"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android"
  ],
  "categories": [
   "Chat and reasoning"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "grok.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "bc4754a3-3f2e-4b42-81f8-dfa238f362ca",
  "slug": "heygen",
  "name": "HeyGen",
  "tagline": "AI avatars and video translation.",
  "description": "Generates presenter style video from a script using AI avatars, including custom avatars of a real person, and translates existing video into other languages with matched lip movement.",
  "tags": [
   "video",
   "avatar",
   "translation",
   "marketing"
  ],
  "features": [
   "AI avatars",
   "Custom avatar cloning",
   "Video translation",
   "Lip sync",
   "Script to video",
   "API"
  ],
  "platforms": [
   "Web",
   "API"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "heygen.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "b9587269-0edc-4266-9913-1ed3da0f5978",
  "slug": "ideogram",
  "name": "Ideogram",
  "tagline": "Image generation with reliable text rendering.",
  "description": "An image generator that stands out for rendering readable text inside images, which makes it a common choice for posters, logos and social graphics.",
  "tags": [
   "image-generation",
   "typography",
   "design"
  ],
  "features": [
   "Text in images",
   "Text to image",
   "Style presets",
   "Magic prompt",
   "Upscaling"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android"
  ],
  "categories": [
   "Image generation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "ideogram.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "aee72a81-c188-41fb-9e66-05185cda1688",
  "slug": "kling",
  "name": "Kling",
  "tagline": "Video generation with strong motion realism.",
  "description": "A video generation model from Kuaishou, known for realistic physical motion and longer clip lengths, with both text to video and image to video modes.",
  "tags": [
   "video",
   "generation",
   "motion"
  ],
  "features": [
   "Text to video",
   "Image to video",
   "Motion brush",
   "Lip sync",
   "Extended clips"
  ],
  "platforms": [
   "Web"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "klingai.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "0e3111ff-8dc4-4388-965a-b33a16a58737",
  "slug": "langchain",
  "name": "LangChain",
  "tagline": "Framework for building applications on language models.",
  "description": "A widely used framework for composing LLM applications, with abstractions for prompts, retrieval, memory and agents, plus LangGraph for stateful multi step workflows.",
  "tags": [
   "automation",
   "framework",
   "developer",
   "rag",
   "agents"
  ],
  "features": [
   "Model abstraction",
   "Retrieval pipelines",
   "Agent tooling",
   "LangGraph state machines",
   "Many integrations"
  ],
  "platforms": [
   "Python",
   "JavaScript",
   "Self hosted"
  ],
  "categories": [
   "Automation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "langchain.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "17286833-a3ce-475a-94ec-e7893286f271",
  "slug": "langsmith",
  "name": "LangSmith",
  "tagline": "Tracing and evaluation for LLM applications.",
  "description": "An observability platform for LLM applications, recording every call in a trace, comparing prompt versions and running evaluations against datasets. The answer to not knowing why an AI feature behaved the way it did.",
  "tags": [
   "automation",
   "observability",
   "evaluation",
   "developer",
   "llm-ops"
  ],
  "features": [
   "Request tracing",
   "Prompt versioning",
   "Dataset evaluation",
   "Cost and latency tracking",
   "Human feedback"
  ],
  "platforms": [
   "Web",
   "API"
  ],
  "categories": [
   "Automation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "langchain.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "bdd4ad6b-7638-4bb8-9f04-285155a0b169",
  "slug": "leonardo-ai",
  "name": "Leonardo AI",
  "tagline": "Image generation aimed at game and production art.",
  "description": "An image platform aimed at production art workflows, with fine tuned model presets, consistent character tools and asset generation for games and marketing.",
  "tags": [
   "image-generation",
   "game-art",
   "production"
  ],
  "features": [
   "Text to image",
   "Custom model training",
   "Consistent characters",
   "Canvas editor",
   "Texture generation"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android"
  ],
  "categories": [
   "Image generation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "leonardo.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "154297a0-ccdd-4006-8e73-b01b738c598e",
  "slug": "luma-dream-machine",
  "name": "Dream Machine",
  "tagline": "Video and 3D generation from Luma.",
  "description": "Luma Labs' video generation product, with text and image to video plus camera motion control, alongside their work on 3D capture and reconstruction.",
  "tags": [
   "video",
   "generation",
   "3d",
   "luma"
  ],
  "features": [
   "Text to video",
   "Image to video",
   "Camera motion",
   "Keyframes",
   "Video extension"
  ],
  "platforms": [
   "Web",
   "iOS"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "lumalabs.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "3179125e-8a5e-466b-acb6-4d86c921cee5",
  "slug": "make",
  "name": "Make",
  "tagline": "Visual automation with fine grained control.",
  "description": "A visual automation platform whose scenario editor exposes more of the data flow than most no code tools, which suits branching, iteration and complex transformations.",
  "tags": [
   "automation",
   "no-code",
   "visual",
   "integrations"
  ],
  "features": [
   "Visual scenario builder",
   "Data mapping",
   "Error handlers",
   "Iterators and aggregators",
   "Scheduling",
   "AI modules"
  ],
  "platforms": [
   "Web"
  ],
  "categories": [
   "Automation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "make.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "c9f22613-b418-48a4-aeab-0500737f1961",
  "slug": "midjourney",
  "name": "Midjourney",
  "tagline": "Image generation known for strong aesthetics.",
  "description": "An image generator with a distinctive and consistently strong aesthetic default. Long run through Discord, now with its own web interface, and widely used for concept art and stylised imagery.",
  "tags": [
   "image-generation",
   "art",
   "discord",
   "stylised"
  ],
  "features": [
   "Text to image",
   "Image to image",
   "Style references",
   "Character references",
   "Upscaling",
   "Inpainting"
  ],
  "platforms": [
   "Web",
   "Discord"
  ],
  "categories": [
   "Image generation"
  ],
  "pricingModel": "paid",
  "cheapestPlanUsd": null,
  "canonicalDomain": "midjourney.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "edb83973-b24c-4f40-8c9b-c7e3b3768ac3",
  "slug": "mistral-le-chat",
  "name": "Le Chat",
  "tagline": "Mistral's assistant, with open weight models behind it.",
  "description": "The assistant from French lab Mistral AI. Notable for fast responses, European hosting and a family of open weight models that can be self hosted or fine tuned.",
  "tags": [
   "chat-and-reasoning",
   "assistant",
   "mistral",
   "open-weights",
   "europe"
  ],
  "features": [
   "Fast inference",
   "Open weight models",
   "European hosting",
   "Code generation",
   "Document analysis"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android"
  ],
  "categories": [
   "Chat and reasoning"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "chat.mistral.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "d5ee722d-2fc4-45d4-82c4-1e189c9406e7",
  "slug": "murf",
  "name": "Murf",
  "tagline": "Voiceover generation for business content.",
  "description": "A voiceover tool aimed at business users, with a studio for timing narration against slides or video, plus voice cloning and multi language output.",
  "tags": [
   "voice-and-audio",
   "tts",
   "voiceover",
   "business"
  ],
  "features": [
   "Text to speech",
   "Voice cloning",
   "Studio timing",
   "Many languages",
   "Video sync",
   "API"
  ],
  "platforms": [
   "Web",
   "API"
  ],
  "categories": [
   "Voice and audio"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "murf.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "ad368940-0f89-4ef0-9b0e-829b4eccd3f9",
  "slug": "n8n",
  "name": "n8n",
  "tagline": "Source available workflow automation you can self host.",
  "description": "A workflow automation tool with a visual node editor, hundreds of integrations and first class AI agent nodes. Source available and self hostable, which makes it common where data cannot leave your own infrastructure.",
  "tags": [
   "automation",
   "workflows",
   "self-hosted",
   "agents"
  ],
  "features": [
   "Visual workflow editor",
   "Hundreds of integrations",
   "AI agent nodes",
   "Self hosting",
   "Custom code steps",
   "Webhooks"
  ],
  "platforms": [
   "Web",
   "Self hosted"
  ],
  "categories": [
   "Automation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "n8n.io",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "90fcc613-812e-45ff-8f58-759738cd19f4",
  "slug": "neon",
  "name": "Neon",
  "tagline": "Serverless Postgres with database branching.",
  "description": "A serverless Postgres platform that separates storage from compute, so databases scale to zero and can be branched like code for each preview deployment. Supports pgvector for embeddings.",
  "tags": [
   "backend-and-data",
   "postgres",
   "serverless",
   "branching"
  ],
  "features": [
   "Serverless Postgres",
   "Database branching",
   "Scale to zero",
   "Point in time restore",
   "pgvector"
  ],
  "platforms": [
   "Web",
   "API"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "neon.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "e076011f-38d6-4484-92f3-2679d2013e0e",
  "slug": "perplexity",
  "name": "Perplexity",
  "tagline": "Answer engine that cites its sources.",
  "description": "A search product that answers questions directly and cites the pages it used, with follow up questions, focused search modes and a deeper research mode for longer reports.",
  "tags": [
   "search-and-research",
   "answer-engine",
   "citations"
  ],
  "features": [
   "Cited answers",
   "Follow up questions",
   "Focus modes",
   "Deep research",
   "File upload",
   "API"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android",
   "macOS",
   "Windows"
  ],
  "categories": [
   "Search and research"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "perplexity.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "3a5908fd-fe90-409f-ae03-83e91e808644",
  "slug": "pika",
  "name": "Pika",
  "tagline": "Fast, playful video generation.",
  "description": "A video generator aimed at short, shareable clips, with effects that manipulate objects in a scene and a fast turnaround suited to social content.",
  "tags": [
   "video",
   "generation",
   "social"
  ],
  "features": [
   "Text to video",
   "Image to video",
   "Video effects",
   "Lip sync",
   "Sound effects"
  ],
  "platforms": [
   "Web",
   "iOS"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "pika.art",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "5bf1fbf7-4485-4e46-a80d-2bc1c66fd440",
  "slug": "pinecone",
  "name": "Pinecone",
  "tagline": "Managed vector database for semantic search.",
  "description": "A managed vector database built for low latency similarity search at scale, with metadata filtering and namespaces, commonly used as the retrieval layer for RAG systems.",
  "tags": [
   "backend-and-data",
   "vector-db",
   "rag",
   "managed"
  ],
  "features": [
   "Vector search",
   "Metadata filtering",
   "Namespaces",
   "Serverless indexes",
   "Hybrid search"
  ],
  "platforms": [
   "API"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "pinecone.io",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "0259e5c8-2775-46c7-93bb-7991c4faabc9",
  "slug": "promptdiff",
  "name": "PromptDiff",
  "tagline": "Version control for prompts, with the evals attached.",
  "description": "Every prompt change is a commit with its eval scores beside it, so a regression is visible before it ships.",
  "tags": [
   "test-fixture",
   "prompts",
   "evals"
  ],
  "features": [
   "Prompt history",
   "Score diffing",
   "Rollback"
  ],
  "platforms": [
   "Web",
   "CLI"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "example.com",
  "rating": 4,
  "ratingCount": 1,
  "verified": false,
  "createdAt": "2026-09-19T16:55:00.949605+00:00",
  "facts": [
   {
    "attribute": "code_generation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "fit_coding",
    "flag": null,
    "text": "moderate",
    "number": null,
    "source": "TEST FIXTURE, not real data"
   }
  ]
 },
 {
  "type": "tool",
  "id": "87229852-fa00-4539-918e-b7b89c03a982",
  "slug": "qdrant",
  "name": "Qdrant",
  "tagline": "Open source vector database written in Rust.",
  "description": "An open source vector database focused on performance and rich filtering, self hostable or managed, with quantisation options that cut memory use substantially.",
  "tags": [
   "backend-and-data",
   "vector-db",
   "open-source",
   "rust",
   "rag"
  ],
  "features": [
   "Vector search",
   "Rich payload filtering",
   "Quantisation",
   "Hybrid search",
   "Self hosting",
   "Snapshots"
  ],
  "platforms": [
   "API",
   "Self hosted",
   "Docker"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "qdrant.tech",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "34071339-80d9-46af-96b8-a6723bb4b83f",
  "slug": "quietindex",
  "name": "QuietIndex",
  "tagline": "Self hosted vector search that stays on your hardware.",
  "description": "A vector index you run yourself, with hybrid search and no data leaving the machine it is installed on.",
  "tags": [
   "test-fixture",
   "vector",
   "self-hosted"
  ],
  "features": [
   "Hybrid search",
   "No telemetry",
   "Single binary"
  ],
  "platforms": [
   "Linux",
   "Docker"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "free",
  "cheapestPlanUsd": null,
  "canonicalDomain": "example.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-21T16:55:00.949605+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "9222282d-5cb0-489d-9166-9e6ab76f6899",
  "slug": "ragbench",
  "name": "RagBench",
  "tagline": "Benchmark your retrieval pipeline before your users do.",
  "description": "Runs a fixed question set against your index and reports recall, precision and answer faithfulness per change.",
  "tags": [
   "test-fixture",
   "rag",
   "evals"
  ],
  "features": [
   "Recall scoring",
   "Regression runs",
   "CI integration"
  ],
  "platforms": [
   "Web",
   "CLI"
  ],
  "categories": [
   "Search and research"
  ],
  "pricingModel": "free",
  "cheapestPlanUsd": null,
  "canonicalDomain": "example.com",
  "rating": 4.7,
  "ratingCount": 3,
  "verified": true,
  "createdAt": "2026-08-25T16:55:00.949605+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "151143a6-f631-414f-9eb5-bba5672a4d3a",
  "slug": "replit",
  "name": "Replit",
  "tagline": "Cloud IDE with an AI agent that builds and deploys.",
  "description": "A browser based development environment with an AI agent that can scaffold, edit and deploy an application. Removes local setup entirely, which makes it common for teaching and prototyping.",
  "tags": [
   "coding",
   "cloud-ide",
   "agent",
   "deployment"
  ],
  "features": [
   "Browser IDE",
   "AI agent",
   "Hosting and deployment",
   "Collaborative editing",
   "Databases"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "replit.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "d43a98e1-5329-4141-bde1-82fa59f3697e",
  "slug": "runway",
  "name": "Runway",
  "tagline": "Video generation and editing for production work.",
  "description": "A video generation and editing platform used in film and advertising, combining text to video, image to video, camera controls and a set of traditional editing tools.",
  "tags": [
   "video",
   "generation",
   "editing",
   "production"
  ],
  "features": [
   "Text to video",
   "Image to video",
   "Camera controls",
   "Inpainting",
   "Green screen",
   "Motion brush"
  ],
  "platforms": [
   "Web",
   "iOS"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "runwayml.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "b439c5d2-bcfb-4165-aed6-e1b80c071b7c",
  "slug": "sora",
  "name": "Sora",
  "tagline": "OpenAI's text to video model.",
  "description": "OpenAI's video generation model, producing clips from text or images with notably coherent motion and scene consistency, available through a dedicated app and to paid ChatGPT subscribers.",
  "tags": [
   "video",
   "generation",
   "openai"
  ],
  "features": [
   "Text to video",
   "Image to video",
   "Scene extension",
   "Remix",
   "Storyboard"
  ],
  "platforms": [
   "Web",
   "iOS"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "paid",
  "cheapestPlanUsd": null,
  "canonicalDomain": "openai.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "2328b910-2a56-4526-b821-ed502e66e9f6",
  "slug": "stable-diffusion",
  "name": "Stable Diffusion",
  "tagline": "Open image models you can run yourself.",
  "description": "Stability AI's open image model family. The foundation of most self hosted image generation, with a large ecosystem of fine tunes, LoRAs and interfaces built on top.",
  "tags": [
   "image-generation",
   "open-weights",
   "self-hosted"
  ],
  "features": [
   "Text to image",
   "Image to image",
   "Inpainting",
   "ControlNet",
   "LoRA fine tuning",
   "Self hostable"
  ],
  "platforms": [
   "Self hosted",
   "API",
   "Web"
  ],
  "categories": [
   "Image generation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "stability.ai",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "e4977202-2ede-436a-97a0-03491b784eb6",
  "slug": "steptrace",
  "name": "StepTrace",
  "tagline": "See exactly where your agent went wrong.",
  "description": "Records every tool call, prompt and token an agent run produced, and lets you replay it from any step.",
  "tags": [
   "test-fixture",
   "agents",
   "observability"
  ],
  "features": [
   "Run replay",
   "Token accounting",
   "Failure diffing"
  ],
  "platforms": [
   "Web"
  ],
  "categories": [
   "Automation"
  ],
  "pricingModel": "paid",
  "cheapestPlanUsd": null,
  "canonicalDomain": "example.com",
  "rating": 3.5,
  "ratingCount": 2,
  "verified": false,
  "createdAt": "2026-09-02T16:55:00.949605+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "abd84df5-563a-4a5c-b6c7-869f26db2a89",
  "slug": "suno",
  "name": "Suno",
  "tagline": "Generates complete songs from a prompt.",
  "description": "Produces full songs, vocals and instrumentation together, from a text prompt or your own lyrics. Used for demos, background music and social content.",
  "tags": [
   "voice-and-audio",
   "music",
   "generation",
   "songs"
  ],
  "features": [
   "Text to song",
   "Custom lyrics",
   "Style control",
   "Stem separation",
   "Song extension"
  ],
  "platforms": [
   "Web",
   "iOS",
   "Android"
  ],
  "categories": [
   "Voice and audio"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "suno.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "4573215d-3f5a-4a1f-8ec7-404592f6575b",
  "slug": "supabase",
  "name": "Supabase",
  "tagline": "Open source Postgres backend with auth and storage.",
  "description": "A backend platform built on Postgres, providing authentication, row level security, storage, edge functions, realtime subscriptions and a vector store, all against a database you can take with you.",
  "tags": [
   "backend-and-data",
   "postgres",
   "auth",
   "vector",
   "open-source"
  ],
  "features": [
   "Postgres database",
   "Authentication",
   "Row level security",
   "Storage",
   "Edge functions",
   "Realtime",
   "pgvector"
  ],
  "platforms": [
   "Web",
   "API",
   "Self hosted"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "supabase.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "f2e8450f-de4d-4f48-9c2b-e8600feb3e75",
  "slug": "synthesia",
  "name": "Synthesia",
  "tagline": "Enterprise video from scripts with AI presenters.",
  "description": "An enterprise focused platform for turning scripts and documents into presenter led video, widely used for training and internal communication, with a large avatar and language library.",
  "tags": [
   "video",
   "avatar",
   "enterprise",
   "training"
  ],
  "features": [
   "AI presenters",
   "Many languages",
   "Templates",
   "Screen recording",
   "Brand kits",
   "Collaboration"
  ],
  "platforms": [
   "Web"
  ],
  "categories": [
   "Video"
  ],
  "pricingModel": "paid",
  "cheapestPlanUsd": null,
  "canonicalDomain": "synthesia.io",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "d63ba5e0-cb95-4229-ac5f-94812fa53b0e",
  "slug": "tavily",
  "name": "Tavily",
  "tagline": "Web search API for agents and RAG.",
  "description": "A search API built for agents, returning cleaned and ranked results with an optional short answer, designed to be dropped into a retrieval pipeline.",
  "tags": [
   "search-and-research",
   "api",
   "agents",
   "rag"
  ],
  "features": [
   "Agent optimised search",
   "Content extraction",
   "Short answers",
   "Topic filters",
   "Domain filters"
  ],
  "platforms": [
   "API"
  ],
  "categories": [
   "Search and research"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "tavily.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "4e5e970a-0719-47a8-abf7-e35b10b700d0",
  "slug": "tokenledger",
  "name": "TokenLedger",
  "tagline": "What your AI features actually cost, per feature.",
  "description": "Attributes provider spend to the feature and the customer that caused it, so a bill becomes a set of decisions.",
  "tags": [
   "test-fixture",
   "cost",
   "infrastructure"
  ],
  "features": [
   "Per feature attribution",
   "Budget alerts",
   "Provider comparison"
  ],
  "platforms": [
   "Web",
   "API"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "paid",
  "cheapestPlanUsd": 29,
  "canonicalDomain": "example.com",
  "rating": 4.7,
  "ratingCount": 3,
  "verified": false,
  "createdAt": "2026-09-16T16:55:00.949605+00:00",
  "facts": [
   {
    "attribute": "automation",
    "flag": true,
    "text": null,
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "integration_slack",
    "flag": false,
    "text": null,
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "deploy_api",
    "flag": true,
    "text": null,
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "trains_on_user_data",
    "flag": null,
    "text": "No, per its data policy",
    "number": null,
    "source": "TEST FIXTURE, not real data"
   },
   {
    "attribute": "certifications",
    "flag": null,
    "text": "SOC 2 Type II",
    "number": null,
    "source": "TEST FIXTURE, not real data"
   }
  ]
 },
 {
  "type": "tool",
  "id": "f7b10f76-d385-461b-8ffb-c6f23ef7ce59",
  "slug": "udio",
  "name": "Udio",
  "tagline": "Music generation with fine control over style.",
  "description": "A music generation tool aimed at higher fidelity output and more granular control over structure, style and instrumentation than a single prompt allows.",
  "tags": [
   "voice-and-audio",
   "music",
   "generation"
  ],
  "features": [
   "Text to music",
   "Style prompts",
   "Section editing",
   "Track extension",
   "Stem downloads"
  ],
  "platforms": [
   "Web"
  ],
  "categories": [
   "Voice and audio"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "udio.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "d02d7e8d-2a9e-45b8-a1da-5ab67c1beff4",
  "slug": "upstash",
  "name": "Upstash",
  "tagline": "Serverless Redis and queues priced per request.",
  "description": "Serverless data services with an HTTP API, so they work from edge and serverless runtimes where a persistent TCP connection is not available. Priced per request, which suits bursty workloads and rate limiting.",
  "tags": [
   "backend-and-data",
   "redis",
   "serverless",
   "rate-limiting",
   "edge"
  ],
  "features": [
   "Serverless Redis",
   "HTTP and REST API",
   "Rate limiting library",
   "Queues and workflows",
   "Vector database",
   "Global replication"
  ],
  "platforms": [
   "API",
   "Edge"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "upstash.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "84958fca-5d0c-4508-8370-5f5e52e60416",
  "slug": "v0",
  "name": "v0",
  "tagline": "Generates React and Tailwind interfaces from prompts.",
  "description": "Vercel's UI generator. Describe an interface and it produces working React with Tailwind and shadcn/ui components, which you can iterate on and deploy straight to Vercel.",
  "tags": [
   "coding",
   "ui",
   "frontend",
   "generation"
  ],
  "features": [
   "Prompt to UI",
   "React and Tailwind output",
   "shadcn/ui components",
   "Deploy to Vercel",
   "Iterative refinement"
  ],
  "platforms": [
   "Web"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "v0.dev",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "d92a592e-9db2-4821-8890-76f64a72ba10",
  "slug": "weaviate",
  "name": "Weaviate",
  "tagline": "Open source vector database with built in vectorisation.",
  "description": "An open source vector database that can generate embeddings itself through module integrations, supports hybrid keyword and vector search, and offers generative search that feeds results straight to a model.",
  "tags": [
   "backend-and-data",
   "vector-db",
   "open-source",
   "hybrid-search",
   "rag"
  ],
  "features": [
   "Vector search",
   "Built in vectorisation",
   "Hybrid search",
   "Generative search",
   "Multi tenancy",
   "Self hosting"
  ],
  "platforms": [
   "API",
   "Self hosted",
   "Docker"
  ],
  "categories": [
   "Backend and data"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "weaviate.io",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "f0bca8f7-7b54-4188-bb61-1e7d32e2a5d2",
  "slug": "windsurf",
  "name": "Windsurf",
  "tagline": "Agentic IDE with a persistent codebase understanding.",
  "description": "An AI native editor whose agent keeps working context across a session, so it can carry a multi step task through a codebase without being re-briefed at every turn.",
  "tags": [
   "coding",
   "editor",
   "ide",
   "agent"
  ],
  "features": [
   "Agent mode",
   "Codebase indexing",
   "Inline edits",
   "Terminal commands",
   "Multi file refactors"
  ],
  "platforms": [
   "macOS",
   "Windows",
   "Linux"
  ],
  "categories": [
   "Coding"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "windsurf.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:54:40.518817+00:00",
  "facts": []
 },
 {
  "type": "tool",
  "id": "3e762a5c-899f-4f86-9af7-aae3275e0024",
  "slug": "zapier",
  "name": "Zapier",
  "tagline": "Connects thousands of apps without code.",
  "description": "The longest established no code automation platform, connecting a very large catalogue of business applications, with AI steps and agents added on top of its trigger and action model.",
  "tags": [
   "automation",
   "no-code",
   "integrations",
   "business"
  ],
  "features": [
   "Thousands of app integrations",
   "Multi step workflows",
   "AI agents",
   "Tables and interfaces",
   "Filters and paths"
  ],
  "platforms": [
   "Web"
  ],
  "categories": [
   "Automation"
  ],
  "pricingModel": "freemium",
  "cheapestPlanUsd": null,
  "canonicalDomain": "zapier.com",
  "rating": null,
  "ratingCount": 0,
  "verified": false,
  "createdAt": "2026-09-13T09:56:09.365729+00:00",
  "facts": []
 }
] as Row[];
