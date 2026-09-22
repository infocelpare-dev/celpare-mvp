/*
  The shapes the Save picker passes between the server and the modal.

  Free of any server import, so the client component and the server action can
  share one definition rather than each describing the same row.
*/

/* The three things a collection can hold. Matches the CHECK constraint on
   user_collection_items and the p_entity_type argument of every RPC, so a fourth
   kind has to be added in all three places at once rather than drifting. */
export type SaveEntity = "tool" | "model" | "post";

export type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  /* Whether the thing being saved is already in this collection. */
  contains: boolean;
};

/*
  THERE IS NO `saved` FIELD, DELIBERATELY. It used to carry the plain saved list,
  back when Saved was its own row at the top of the picker. Saving is filing into
  a collection now, so "is this saved" is a fact ABOUT THE COLLECTIONS: it is true
  when at least one of them contains the thing, which this list already says.

  Keeping a second copy of that answer is how the two come to disagree, and the
  copy is the one that would have looked authoritative.
*/
export type SaveTargets = {
  collections: CollectionRow[];
  /* How many collections this plan allows, and how many exist. Null means
     unlimited. The picker uses it to explain a refusal BEFORE it happens rather
     than offering Create and then reporting failure. */
  limit: number | null;
  used: number;
};

export const NO_TARGETS: SaveTargets = {
  collections: [],
  limit: 0,
  used: 0,
};

export type SaveResult =
  | { status: "ok"; collectionId?: string; contains?: boolean }
  | { status: "error"; message: string };
