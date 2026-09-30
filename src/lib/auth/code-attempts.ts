import "server-only";
import { bump, clearCounter } from "@/lib/ai/ratelimit";

/*
  Wrong code limit (D189): three wrong codes are allowed, the fourth locks the
  code. The count lives in Upstash with the other limits, per screen and per
  address, and restarts when a new code is sent. A locked login code needs the
  password again; a locked signup code needs "Send a new code".

  Fails open with a log line. Supabase still limits /verify per address, and
  refusing every login because Redis blinked would lock everyone out.
*/

export const MAX_WRONG_CODES = 4;
const WINDOW_S = 60 * 60;

export type CodeMode = "login" | "signup";

const key = (mode: CodeMode, email: string) =>
  `auth:code-wrong:${mode}:${email.trim().toLowerCase()}`;

export async function wrongCodes(mode: CodeMode, email: string): Promise<number> {
  try {
    return await bump(key(mode, email), 0, WINDOW_S);
  } catch (err) {
    console.error("[auth] wrong code count unavailable", err);
    return 0;
  }
}

export async function countWrongCode(mode: CodeMode, email: string): Promise<number> {
  try {
    return await bump(key(mode, email), 1, WINDOW_S);
  } catch (err) {
    console.error("[auth] wrong code not counted", err);
    return 0;
  }
}

export async function resetWrongCodes(mode: CodeMode, email: string): Promise<void> {
  try {
    await clearCounter(key(mode, email));
  } catch (err) {
    console.error("[auth] wrong code count not reset", err);
  }
}
