/*
  The Celpare spark: a four pointed star with concave sides, from the mark the
  founder supplied on 2026-09-13.

  Drawn rather than imported. As a path it takes `currentColor`, so it turns
  lime when a nav item is active and inherits the text colour everywhere else,
  it stays sharp at any size, and it costs no request. A PNG would do none of
  those and would need a second file for the light theme.

  Shaped to match lucide's icons: a 24 unit box, so it sits on the same optical
  size as the other five sidebar icons.
*/
export function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* Each side bows inward towards the centre, which is what gives the mark
          its points rather than the flat edges of a diamond. */}
      <path d="M12 1.5c.55 5.2 4.8 9.45 10 10 -5.2.55-9.45 4.8-10 10 -.55-5.2-4.8-9.45-10-10 5.2-.55 9.45-4.8 10-10Z" />
    </svg>
  );
}
