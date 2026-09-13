import { OUTPUT_WINDOW_CHARS } from "./config";

/*
  Layer 3 of the three layer model, and the one with a real design problem.

  Notion's pipeline says: call the model, filter the response, return it. A
  streaming UI wants to paint tokens the instant they arrive. Those cannot both
  be true, and if raw tokens go straight to the browser the filter is
  decorative: the secret is already on screen by the time it is redacted.

  D38 resolves it by streaming behind a sliding window.
*/

type Rule = { re: RegExp; label: string };

const REDACT: Rule[] = [
  // JWTs. Three base64url segments, distinctive enough not to hit prose.
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, label: "jwt" },
  // Provider key shapes.
  { re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, label: "openai-key" },
  { re: /\bAIza[A-Za-z0-9_-]{20,}\b/g, label: "google-key" },
  { re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, label: "github-token" },
  { re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, label: "slack-token" },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: "aws-key" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, label: "private-key" },
  // Email addresses. Notion lists these explicitly under what must be stripped.
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: "email" },
  // The one Supabase credential that bypasses every RLS policy.
  { re: /\bservice_role\b/g, label: "service-role" },
];

/* Payment card numbers, verified with Luhn rather than by shape alone, because
   a bare 16 digit regex redacts ordinary numbers and looks broken. */
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/*
  House style, enforced rather than requested.

  Hard rule 1 of this project is no em dashes anywhere, and the system prompt
  says so. A model ignored it on 2026-09-13 and shipped an en dash straight to
  the browser, in "Opus Clip, AI that finds highlights", where the comma here
  was a dash there. A prompt is not a control, which is the same
  argument D35 makes about scope, so the rule is applied here where it cannot
  be talked out of.

  Numeric ranges become "to", because "10, 20" would change the meaning. A
  spaced dash becomes a comma, which is what the rule asks for. An unspaced one
  is doing the job of a hyphen, so it becomes a hyphen.
*/
function houseStyle(text: string): string {
  return text
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+–\s+/g, ", ")
    .replace(/[–‑]/g, "-");
}

/*
  The stack, redacted from anything the model writes.

  Founder rule: what runs Ask Celpare is not disclosed. The identity lane in the
  classifier answers "which model are you" locally so the question never reaches
  a model, and the system prompt says not to tell. Both are good; neither is a
  control. This is: the configured model id and the provider names cannot leave
  the server inside an answer, whatever the model was talked into.

  Read from the environment so a model change carries automatically. Serper is
  deliberately absent: it is a real row in the Celpare catalogue, and redacting
  it would corrupt honest answers about a tool people can look up.
*/

/*
  Words that are products in the catalogue before they are ever our stack.

  This is the guard rail on the rule below. Point the model at a GPT or a Claude
  and the naive version would start redacting the answer to "compare Claude and
  ChatGPT", which is the product's own example question. Hiding what runs
  Celpare must never cost the ability to talk about what people can buy.
*/
const PRODUCT_WORDS = new Set([
  "gpt",
  "chatgpt",
  "claude",
  "gemini",
  "llama",
  "mistral",
  "qwen",
  "deepseek",
  "grok",
  "copilot",
  "sonnet",
  "opus",
  "haiku",
  "flash",
  "pro",
  "mini",
  "turbo",
  "free",
]);

function stackTerms(): string[] {
  const configured = [
    process.env.OPENROUTER_MODEL,
    process.env.OPENROUTER_MODEL_FAST,
    process.env.GLM_MODEL,
    process.env.GLM_MODEL_FAST,
  ].filter((v): v is string => Boolean(v));

  /*
    The full id, the id without its org and tag, the family, the bare family
    word and the vendor. "I run on Nemotron" and "a model by Nvidia" leak the
    same thing the full slug does, so a term list of one is not a list.
  */
  const parts = configured.flatMap((id) => {
    const org = id.includes("/") ? id.split("/")[0] : "";
    const bare = id.split("/").pop()?.split(":")[0] ?? "";
    const family = bare.split("-").slice(0, 2).join("-");
    const word = bare.split("-")[0] ?? "";
    return [id, bare, family, word, org];
  });

  return [
    ...new Set(
      [...parts, "openrouter", "open router"]
        .map((v) => v.trim())
        .filter((v) => v.length >= 5 && !PRODUCT_WORDS.has(v.toLowerCase())),
    ),
  ];
}

/* A model id contains dots, slashes and colons, which are regex syntax. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactStack(text: string, hits: Redaction[]): string {
  let out = text;
  for (const term of stackTerms()) {
    /* Escaped, because a model id can contain a dot, a slash or a colon and
       those are regex syntax. */
    const re = new RegExp(escapeRegex(term), "gi");
    out = out.replace(re, () => {
      hits.push({ label: "stack" });
      return "[not disclosed]";
    });
  }
  return out;
}

export type Redaction = { label: string };

export function redact(text: string): { text: string; hits: Redaction[] } {
  const hits: Redaction[] = [];
  let out = redactStack(houseStyle(text), hits);

  for (const { re, label } of REDACT) {
    out = out.replace(re, () => {
      hits.push({ label });
      return "[redacted]";
    });
  }

  out = out.replace(CARD, (match) => {
    const digits = match.replace(/[^0-9]/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return match;
    hits.push({ label: "card" });
    return "[redacted]";
  });

  return { text: out, hits };
}

/*
  The streaming filter.

  The obvious implementation is to redact each released slice and keep a raw
  tail. It is wrong, and subtly: a secret can straddle the cut. If the buffer
  holds "...sk-ABCD" and the cut falls four characters in, the released half is
  "sk-" which matches nothing, the held half is "ABCD" which matches nothing,
  and the key ships in two harmless looking pieces. Cutting on whitespace does
  not save it either, because the card and private key patterns contain spaces.

  So this redacts the WHOLE accumulated answer every time and emits only the
  part that is already OUTPUT_WINDOW_CHARS behind the end. A pattern near the
  end is therefore always complete before the text containing it is released,
  and because the redaction is recomputed from the raw text each round, a match
  that only becomes visible later still applies to text not yet emitted.

  It is O(n) per chunk over an answer capped at a few thousand tokens, which is
  a trade worth making for a filter that is correct rather than nearly correct.

  If the canary appears, the system prompt has been extracted. That is not a
  redaction case: the answer is abandoned wholesale, because a model reciting
  its instructions is not answering the question, and removing one identifier
  would leave the rest of the leak on screen.
*/
export class OutputFilter {
  private raw = "";
  private emitted = 0;
  private readonly canary: string;
  private tripped = false;
  hits: Redaction[] = [];

  constructor(canary: string) {
    this.canary = canary;
  }

  get canaryTripped() {
    return this.tripped;
  }

  private release(holdBack: number): string {
    const { text, hits } = redact(this.raw);
    this.hits = hits;

    const upTo = Math.max(0, text.length - holdBack);
    if (upTo <= this.emitted) return "";

    const out = text.slice(this.emitted, upTo);
    this.emitted = upTo;
    return out;
  }

  push(chunk: string): string {
    if (this.tripped) return "";
    this.raw += chunk;

    if (this.raw.includes(this.canary)) {
      this.tripped = true;
      this.raw = "";
      return "";
    }

    return this.release(OUTPUT_WINDOW_CHARS);
  }

  flush(): string {
    if (this.tripped) return "";
    return this.release(0);
  }
}
