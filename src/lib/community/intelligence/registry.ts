import { EXPLORATION, INTENT, INTENT_RULES, MEASURED, NEGATIVE, NOVELTY, SATURATION, SESSION, SIGNALS } from "./config";
import { DISTRIBUTION } from "./distribution";
import { DIVERSITY } from "./diversity";
import { EXPECTED_OPEN_BY_POSITION } from "./evaluation";
import { FEED } from "./feed";
import { DECAY } from "./freshness";
import { INTERESTS } from "./interests";
import { QUALITY } from "./quality";
import { REELS } from "./reels";
import { SAFETY } from "./safety";
import { OBJECTIVES } from "./scoring";
import { SEEN } from "./seen";
import { TRENDING } from "./trending";
import { VIRAL, LIFECYCLE } from "./viral";
import { ALGORITHMS } from "./versions";

/*
  Every tunable number in Community Intelligence, gathered read only in one
  object. Nothing reads configuration from here to rank (each module reads its
  own table, or config.ts), so this cannot create import cycles; it exists so
  the debug view, the docs and future experiments have one place to look.
*/
export const REGISTRY = {
  algorithms: ALGORITHMS,
  signals: SIGNALS,
  measured: MEASURED,
  session: SESSION,
  intent: INTENT,
  intentRules: INTENT_RULES,
  exploration: EXPLORATION,
  novelty: NOVELTY,
  saturation: SATURATION,
  negative: NEGATIVE,
  seen: SEEN,
  objectives: OBJECTIVES,
  freshness: DECAY,
  diversity: DIVERSITY,
  distribution: DISTRIBUTION,
  viral: VIRAL,
  lifecycle: LIFECYCLE,
  trending: TRENDING,
  quality: QUALITY,
  safety: SAFETY,
  interests: INTERESTS,
  feed: FEED,
  reels: REELS,
  expectedOpenByPosition: EXPECTED_OPEN_BY_POSITION,
} as const;
