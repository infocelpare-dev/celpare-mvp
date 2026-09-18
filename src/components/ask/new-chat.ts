"use client";

import { useSyncExternalStore } from "react";

/*
  "New chat" and the conversation it clears sit in different branches of the
  Ask Celpare layout: the button is in the history panel, passed to the shell
  as `asideStart`, and the conversation is the page, passed as `children`.

  A link to /ask cannot clear the chat on its own, because a new chat already
  lives at /ask and its id never reaches the URL. Clicking the button while a
  conversation is open there navigates to the page you are already on, React
  keeps the mounted chat exactly as it was, and the next question appends to
  the conversation you thought you had left.

  So the button says so out loud, and the chat listens. One counter is enough:
  there is only ever one conversation on screen, which is a weaker thing to
  rely on than threading a provider through a layout that renders the two as
  sibling props.
*/

let token = 0;
const listeners = new Set<() => void>();

/** Tell the open conversation to start again from empty. */
export function startNewChat() {
  token += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return token;
}

/* The server renders a chat nobody has cleared yet, by definition. */
function getServerSnapshot() {
  return 0;
}

export function useNewChatToken() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
