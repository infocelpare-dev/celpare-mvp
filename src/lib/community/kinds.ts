/*
  What a post can be, in one place that BOTH a server action and a client
  component can import.

  WHY THIS IS ITS OWN FILE. It started life as an exported const inside
  app/actions/community.ts, which is a "use server" module, and that throws:

    Error: A "use server" file can only export async functions, found object.

  Worth knowing about that failure: `next build` exits 0 on it. It is raised
  when the actions module is actually loaded, so it surfaces as a 500 on the
  first POST to the form and not at compile time, the same way the undefined
  initial state did. A "use server" file exports async functions and types,
  and nothing else, ever.

  The list is also the single source for the zod enum and the composer's
  dropdown, so the two cannot drift.
*/

/* Every value posts_kind_ok accepts. */
export const POST_KINDS = [
  "text",
  "image",
  "video",
  "link",
  "tool",
  "model",
  "launch",
  "question",
  "announcement",
] as const;

export type PostKind = (typeof POST_KINDS)[number];

/*
  The kinds a person can CHOOSE, and the ones deliberately absent.

  'image', 'video' and 'link' are facts about a post, derived by createPost
  from whether media or a link was attached. Offering them would let a post
  labelled Video carry no video, which is the same dishonesty D13 and D30 rule
  out for metrics and activity.
*/
export const CHOOSABLE_KINDS: {
  value: PostKind;
  label: string;
  hint: string;
}[] = [
  { value: "text", label: "A post", hint: "Anything you want to say." },
  { value: "question", label: "A question", hint: "You want an answer." },
  { value: "tool", label: "About a tool", hint: "Pick it from the directory." },
  { value: "model", label: "About a model", hint: "Pick it from the directory." },
  { value: "launch", label: "A launch", hint: "You shipped something." },
  { value: "announcement", label: "An announcement", hint: "News worth knowing." },
];

/* The kinds worth a badge on a card. A text post is a text post, and an image
   post already has images on it, so labelling either is ink for nothing. */
export const KIND_LABELS: Partial<Record<PostKind, string>> = {
  launch: "Launch",
  question: "Question",
  announcement: "Announcement",
};
