/*
  The session recorder's masking rules and the one check that protects them
  (D269). Pure, so the tests can pin it.

  Text and inputs masked, media left out. Never loosen this globally: Celpare
  pages carry private messages, Ask questions and email addresses.
*/
export const RRWEB_PRIVACY = {
  maskAllInputs: true,
  maskTextSelector: "*",
  blockSelector: "img, picture, video, audio, canvas, object, embed, iframe",
} as const;

export type ConsolePrivacy = {
  privacy_mode?: string;
  blocked_elements?: string[];
  masked_elements?: string[];
  unmasked_elements?: string[];
};

/*
  Statsig's console privacy settings REPLACE the rules above whenever they are
  anything but the untouched default (mode "min", no element lists); that is
  how @statsig/session-replay 3.33 behaves. True when the replacement could
  show text: any mode but "max", or "max" with elements unmasked. The recorder
  then refuses to record at all.
*/
export function consoleUnmasks(settings: ConsolePrivacy | null | undefined): boolean {
  if (!settings) return false;
  const replaces =
    settings.privacy_mode !== "min" ||
    Boolean(settings.blocked_elements || settings.masked_elements || settings.unmasked_elements);
  if (!replaces) return false;
  return settings.privacy_mode !== "max" || Boolean(settings.unmasked_elements?.length);
}
