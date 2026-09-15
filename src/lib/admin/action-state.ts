/*
  The shape every admin action answers with.

  It lives here rather than beside the actions because a "use server" file may
  only export async functions: a plain object exported from one fails the build
  with "found object". The type alone would have been fine, since types are
  erased, but IDLE is a value and the two belong together.
*/
export type AdminState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const IDLE: AdminState = { status: "idle", message: "" };
