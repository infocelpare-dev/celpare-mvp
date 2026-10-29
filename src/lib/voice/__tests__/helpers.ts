import { toBase64 } from "../providers/google-auth";
import type { ServiceAccount } from "../providers/google-auth";

/*
  Test helpers. The service account key is generated at run time, never stored:
  a key in the repository, even a test one, would trip the secret scan and
  teach the wrong habit. The PEM armour is assembled from parts for the same
  reason.
*/

const DASHES = "-".repeat(5);

export async function testServiceAccount(): Promise<{ sa: ServiceAccount; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const body = toBase64(pkcs8).replace(/(.{64})/g, "$1\n");
  const label = ["PRIVATE", "KEY"].join(" ");
  const pem = `${DASHES}BEGIN ${label}${DASHES}\n${body}\n${DASHES}END ${label}${DASHES}\n`;
  return {
    sa: { client_email: "voice-test@example-project.iam.gserviceaccount.com", private_key: pem },
    publicKey: pair.publicKey,
  };
}

export type Call = { url: string; init: RequestInit };

/* A fetch that answers from a script and records what it was asked. */
export function scriptedFetch(answers: ((call: Call) => Response | Promise<Response>)[]) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    const answer = answers[Math.min(i, answers.length - 1)];
    i += 1;
    return answer(call);
  }) as typeof fetch;
  return { fetch: fn, calls };
}

export const tokenOk = () =>
  new Response(JSON.stringify({ access_token: "ya29.test-token", expires_in: 3600 }), { status: 200 });

export const recognizeOk = (transcript: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ results: [{ alternatives: [{ transcript, confidence: 0.91 }], languageCode: "en-us", ...extra }] }), {
    status: 200,
  });

export const audio = (n = 4000) => new Uint8Array(n).fill(7);
