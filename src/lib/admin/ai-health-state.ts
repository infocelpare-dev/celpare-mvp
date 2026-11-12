/*
  How the admin health page judges the AI provider from a day of real requests.

  Below AI_HEALTH_MIN_SAMPLE requests a failure rate says more about who
  retried than about the provider. On 2026-11-12 three failures in nine
  requests (two of them four seconds apart, one person retrying) read as
  "down" while Ask answered every question put to it.
*/
export type AiHealthState = "healthy" | "degraded" | "down" | "unknown";

export const AI_HEALTH_MIN_SAMPLE = 20;

export function aiProviderState(requests: number, failed: number): AiHealthState {
  if (requests <= 0) return "unknown";
  // Every request failing is down at any volume, once it is more than a blip.
  if (failed >= requests && requests >= 3) return "down";
  if (requests < AI_HEALTH_MIN_SAMPLE) return failed > 0 ? "degraded" : "healthy";
  const errorRate = failed / requests;
  return errorRate > 0.25 ? "down" : errorRate > 0.05 ? "degraded" : "healthy";
}
