/*
  A model is drawn with its maker's logo (D199). Models have no logo of their
  own: the provider is the brand a person recognises, and every surface that
  draws a model already has its provider. Each file is the provider's own icon,
  taken from its site on 2026-10-04, in the public tool-images bucket.

  An unknown provider returns null and the caller keeps its letter, so a new
  provider never renders a broken image.
*/

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/tool-images/logos/providers`;

const KEYS: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  spacexai: "spacexai",
  xai: "spacexai",
  deepseek: "deepseek",
};

export function providerLogo(provider: string | null | undefined): string | null {
  if (!provider || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const key = KEYS[provider.toLowerCase().replace(/[^a-z]/g, "")];
  return key ? `${BASE}/${key}.png` : null;
}
