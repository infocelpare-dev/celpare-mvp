/*
  Everyday words, said in the catalogue's own words.

  People ask "make my grandma's old photo move". The catalogue says "image to
  video" and "motion". Both of Ask's lanes match words literally: search_tools
  needs half of a question's distinctive terms to hit a tool, and the engine's
  query vector drops any word the catalogue never uses. So "photo" and "move"
  counted for nothing, the engine matched what was left, and the answer called
  Runway and Dream Machine "outside the catalogue" while both were in it
  (truth pass, 2026-11-10).

  The rule for an entry: the everyday word does NOT appear in the catalogue, and
  every word it becomes DOES, with the same meaning. A word the catalogue already
  uses is never rewritten, because that would change what a working question
  matches. The replacement keeps no copy of the original word: by this rule it
  could not have matched anything anyway, and keeping it would count against the
  half of the terms that search_tools requires.

  This is retrieval only. The question the model reads and the question shown to
  the person are never rewritten.
*/
export const EVERYDAY_WORDS: Readonly<Record<string, string>> = {
  photo: "image",
  photos: "image",
  picture: "image",
  pictures: "image",
  pic: "image",
  pics: "image",
  selfie: "image",
  selfies: "image",
  thumbnail: "image",
  thumbnails: "image",
  move: "video motion",
  moving: "video motion",
  subtitle: "captions",
  subtitles: "captions",
  website: "web app",
  websites: "web app",
  webpage: "web app",
  site: "web app",
  pdf: "document",
  contract: "document",
  contracts: "document",
  jingle: "music",
  /* Checked against the live catalogue on 2026-11-10 and left out because the
     catalogue already uses them: animate, animated, animation, pdfs, voiceover,
     and tune ("fine tune", a different meaning). */
};

/* Rewrites whole words only, case insensitive, so "photographer" is untouched. */
export function toCatalogueWords(text: string): string {
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => EVERYDAY_WORDS[word.toLowerCase()] ?? word);
}
