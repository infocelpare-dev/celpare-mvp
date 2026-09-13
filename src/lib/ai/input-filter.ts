import { INPUT_MAX_CHARS } from "./config";

/*
  Layer 1 of the three layer model in 06-ai-gateway.md.

  This is a cheap sieve, not a guarantee. Prompt injection is not solved by
  pattern matching, and pretending otherwise is how people end up with one
  control instead of three. The controls that actually hold are structural: the
  allowlisted SQL projection (D39) means a successful injection still cannot
  reach a column it was not granted, and the output filter (D38) means it still
  cannot get a secret out. This layer exists to catch the obvious and to keep
  junk out of the token bill.
*/

export type InputVerdict =
  | { ok: true; text: string }
  | { ok: false; reason: string; message: string };

const INJECTION_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/i, label: "override" },
  { re: /disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|rules?)/i, label: "override" },
  { re: /(reveal|show|print|repeat|output)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i, label: "extraction" },
  { re: /what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions)/i, label: "extraction" },
  { re: /you\s+are\s+now\s+(a|an|no longer)/i, label: "roleplay" },
  { re: /pretend\s+(you\s+are|to\s+be)\s+/i, label: "roleplay" },
  { re: /developer\s+mode|jailbreak|DAN\s+mode|do\s+anything\s+now/i, label: "jailbreak" },
  // The instruction replacement family. "Ignore previous" is the famous one and
  // the least used now; these are what actually turns up.
  { re: /(from\s+now\s+on|for\s+the\s+rest\s+of\s+this\s+(chat|conversation))[^.]{0,40}\b(you|answer|respond|reply)\b/i, label: "override" },
  { re: /(new|updated|real|actual|true)\s+(instructions?|rules?|system\s+prompt)\s*[:\-]/i, label: "override" },
  { re: /\b(override|bypass|turn\s+off|disable|forget)\s+(your\s+)?(rules?|restrictions?|filters?|guardrails?|safety|instructions?)/i, label: "override" },
  { re: /\b(without|no)\s+(any\s+)?(restrictions?|filters?|limits?|censorship)/i, label: "override" },
  // Extraction, beyond asking for the prompt directly.
  { re: /(repeat|print|echo|output|show)\s+(everything|all|the\s+text|the\s+words?)\s+(above|before|preceding)/i, label: "extraction" },
  { re: /what\s+(were|was)\s+you\s+(told|instructed|programmed)/i, label: "extraction" },
  { re: /\b(list|show|name)\s+(your|the)\s+(tools?|functions?|capabilities|api\s+keys?|env|environment)/i, label: "extraction" },
  { re: /\b(canary|system\s+message|developer\s+message|hidden\s+prompt)\b/i, label: "extraction" },
  // Persona replacement, including the polite forms.
  { re: /\b(act|behave|respond)\s+as\s+(a|an|if\s+you)\b/i, label: "roleplay" },
  { re: /\byou\s+(must|will|shall)\s+(now\s+)?(always\s+)?(obey|comply|follow\s+my)/i, label: "roleplay" },
  // Forged structure, which is what a model actually reads as a turn boundary.
  { re: /<\/?(system|user|assistant|instructions?)>/i, label: "forged-role" },
  { re: /\[(system|instructions?|end\s+of\s+prompt)\]/i, label: "forged-role" },
  { re: /^#{1,6}\s*(system|instructions?)\b/im, label: "forged-role" },
  // Asking for the answer to be encoded is usually an attempt to carry
  // something past a filter that reads plain text.
  { re: /\b(base64|rot13|hex)\s*(encode|decode|the\s+(above|following))/i, label: "encoded" },
  // Fake conversation markers, an attempt to forge turns inside one message.
  { re: /^\s*(system|assistant)\s*:/im, label: "forged-role" },
  { re: /<\|(im_start|im_end|system|endoftext)\|>/i, label: "forged-role" },
  // Markdown image exfiltration: the model is talked into emitting an image
  // whose URL carries stolen text, and the browser fetches it. The one people
  // forget, because it does not look like an attack.
  { re: /!\[[^\]]*\]\(\s*https?:\/\//i, label: "image-exfil" },
];

/* Long unbroken base64 or hex, which is usually a payload rather than a
   question, and always expensive to tokenise. */
const BLOB = /[A-Za-z0-9+/=]{600,}|[0-9a-f]{400,}/i;

/*
  Code, refused rather than answered. Founder rule, 2026-09-13.

  Two reasons, and the second is the one that matters. Celpare recommends tools;
  it does not review, debug or write code, and answering as if it did sets an
  expectation the product will not meet. And a code block is the most reliable
  way to smuggle instructions past a reader: comments, strings and docstrings
  all look like data to a person and like text to a model.

  Refused, not silently stripped. Somebody who pasted a stack trace should be
  told why nothing happened, rather than getting an answer that ignored half
  their message.

  Deliberately conservative. "Does it have an API?" and "which library should I
  use" are ordinary questions and must not trip this, so a single keyword never
  fires it: a fenced block does, or two independent syntax signals do.
*/
/*
  Signals that are code on their own. A fenced block, a SQL statement and a
  stack trace are not phrasings a person stumbles into while asking which tool
  to use, so one is enough.
*/
const STRONG_CODE: RegExp[] = [
  /```|^ {4,}\S+.*\n {4,}\S+/m,
  /\b(select|insert\s+into|update|delete\s+from|create\s+table|drop\s+table|alter\s+table)\b[\s\S]{0,80}\b(from|set|values|where|into|table)\b/i,
  /\bTraceback \(most recent call last\)|\bat\s+\w+\s*\([^)]*:\d+:\d+\)|^\s*File ".*", line \d+/m,
  /<\/?(script|html|body|head|style)\b|^#!\s*\//im,
];

const CODE_SIGNALS: RegExp[] = [
  /\b(function|const|let|var)\s+\w+\s*[=(]/,
  /\b(def|class)\s+\w+\s*[(:]/,
  /\bimport\s+[\w{*][^;\n]*\s+from\s+['"]/,
  /\b(from\s+\w+\s+import|#include\s*<|using\s+namespace)\b/,
  /\b(public|private|protected)\s+(static\s+)?(void|int|string|class)\b/i,
  /\breturn\s+[^;\n]{1,60};/,
  /\bconsole\.(log|error)\s*\(|\bprint\s*\(\s*['"]/,
  /\b(select|insert\s+into|update|delete\s+from)\b[\s\S]{0,60}\b(from|set|values|where)\b/i,
  /<\/?(script|div|span|html|body|head)\b/i,
  /\}\s*(else|catch|finally)\s*\{|\)\s*=>\s*\{/,
  /^\s*(\w+\s*:\s*.+,\s*)$/m,
  /\b(npm|yarn|pnpm|pip|cargo|go)\s+(install|add|run)\s+\S/,
  /\bTraceback \(most recent call last\)|\bat\s+\w+\s*\([^)]*:\d+:\d+\)/,
];

function looksLikeCode(text: string): boolean {
  if (STRONG_CODE.some((re) => re.test(text))) return true;
  // Everything else needs corroboration, so one stray brace or semicolon in a
  // normal question is not enough to refuse it.
  return CODE_SIGNALS.filter((re) => re.test(text)).length >= 2;
}

/*
  Written as code point comparisons rather than a regex character class on
  purpose. These ranges are exactly the characters that do not survive being
  written as escape sequences through a tool chain, and a mangled range here
  fails silently: it would still compile, still run, and quietly stop stripping
  anything.

  Control characters, keeping newline (0x0A) and tab (0x09). Then the zero width
  and bidirectional formatting characters, which are used to hide instructions
  inside text that looks completely ordinary on screen.
*/
function isUnsafeCodePoint(c: number): boolean {
  if (c <= 0x08) return true;
  if (c === 0x0b || c === 0x0c) return true;
  if (c >= 0x0e && c <= 0x1f) return true;
  if (c === 0x7f) return true;
  if (c >= 0x200b && c <= 0x200f) return true; // zero width, LTR and RTL marks
  if (c >= 0x202a && c <= 0x202e) return true; // bidi overrides
  if (c >= 0x2060 && c <= 0x2064) return true; // word joiner, invisible operators
  if (c === 0xfeff) return true; // byte order mark
  return false;
}

function stripUnsafe(input: string): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0);
    if (c === undefined || !isUnsafeCodePoint(c)) out += ch;
  }
  return out;
}

export function filterInput(raw: unknown): InputVerdict {
  if (typeof raw !== "string") {
    return { ok: false, reason: "type", message: "Send a message as text." };
  }

  const cleaned = stripUnsafe(raw).trim();

  if (cleaned.length === 0) {
    return { ok: false, reason: "empty", message: "Type a question first." };
  }

  if (cleaned.length > INPUT_MAX_CHARS) {
    return {
      ok: false,
      reason: "too-long",
      message: `That message is ${cleaned.length.toLocaleString()} characters. Keep it under ${INPUT_MAX_CHARS.toLocaleString()}.`,
    };
  }

  if (BLOB.test(cleaned)) {
    return {
      ok: false,
      reason: "blob",
      message: "That message contains a long encoded block. Send the question as plain text.",
    };
  }

  if (looksLikeCode(cleaned)) {
    return {
      ok: false,
      reason: "code",
      message:
        "Celpare does not read or write code, so I have treated that as text and left it. Describe what you are trying to build and I will find the tools for it.",
    };
  }

  for (const { re, label } of INJECTION_PATTERNS) {
    if (re.test(cleaned)) {
      return {
        ok: false,
        reason: `injection:${label}`,
        // Deliberately not "nice try". A fair number of these are curious
        // people rather than attackers, so it says what it will do instead.
        message:
          "I can only answer questions about AI tools, models, tech and SaaS. Ask me what you are trying to build or choose.",
      };
    }
  }

  return { ok: true, text: cleaned };
}
