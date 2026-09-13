/*
  The skeleton for a saved chat, shown while the transcript is fetched.

  A saved conversation is read from the database before anything can render, so
  without this the screen is empty for the length of that round trip. The shape
  mirrors the real transcript, a question on the right and an answer on the
  left, so the page does not jump when the content lands.
*/
export default function LoadingSavedChat() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-8 sm:px-6" aria-busy="true">
      <span className="sr-only">Loading this conversation</span>

      <div className="space-y-8 motion-safe:animate-pulse">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-4">
            <div className="flex justify-end">
              <div className="h-11 w-[55%] rounded-2xl border border-border bg-surface" />
            </div>

            <div className="space-y-2">
              <div className="h-3.5 w-24 rounded bg-surface" />
              <div className="h-3.5 w-full rounded bg-surface" />
              <div className="h-3.5 w-[92%] rounded bg-surface" />
              <div className="h-3.5 w-[70%] rounded bg-surface" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
