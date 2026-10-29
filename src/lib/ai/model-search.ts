import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ModelCitation } from "./types";

/*
  Catalogue search covers models too (founder, 2026-10-07): the same always on
  catalogue search that finds tools, SaaS and tech also finds AI models.

  public.search_models is the boundary (D39): its return type is the allowlist,
  it is SECURITY INVOKER so RLS keeps it to approved models, and it leaves out
  test fixtures. Generic words (best, AI, model, tool) do not count toward a
  match, and a question that names a model, family or maker matches on the
  name, so "compare gemini and gpt" finds both while "best AI tools for video"
  finds no models.
*/
export const MODEL_SEARCH_LIMIT = 4;

export async function searchModels(question: string, limit = MODEL_SEARCH_LIMIT): Promise<ModelCitation[]> {
  if (!isSupabaseConfigured() || !question.trim()) return [];
  try {
    const { data, error } = await createAnonClient().rpc("search_models", { q: question, lim: limit });
    if (error) {
      console.error("[ai] model search failed", error.code, error.message);
      return [];
    }
    return (data ?? []) as ModelCitation[];
  } catch (err) {
    console.error("[ai] model search threw", err);
    return [];
  }
}
