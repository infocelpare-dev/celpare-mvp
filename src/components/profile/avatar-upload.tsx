"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { uploadAvatar, removeAvatar, type AvatarState } from "@/app/actions/avatar";

/*
  Picture upload for your own profile.

  The file input is hidden behind a real button rather than styled, because a
  native file input cannot be restyled consistently and a label wrapping a
  button is the pattern that stays keyboard and screen reader correct.

  It submits on choose. Picking a file and then having to press Save as well is
  a step nobody expects from a picture.

  A local preview shows immediately from the chosen file, so the change is
  visible before the round trip. If the server refuses it, the preview is
  dropped and the stored picture comes back, which is the honest outcome: the
  preview was never the truth.
*/
export function AvatarUpload({
  fullName,
  username,
  avatarUrl,
}: {
  fullName: string | null;
  username: string;
  avatarUrl: string | null;
}) {
  const [upState, upAction, uploading] = useActionState<AvatarState, FormData>(
    uploadAvatar,
    { status: "idle", message: "" },
  );
  const [rmState, rmAction, removing] = useActionState<AvatarState, FormData>(
    removeAvatar,
    { status: "idle", message: "" },
  );

  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const state = upState.status !== "idle" ? upState : rmState;
  const busy = uploading || removing;

  // A rejected upload must not keep showing the picture that was rejected.
  const shown = upState.status === "error" ? avatarUrl : (preview ?? avatarUrl);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar size="lg" fullName={fullName} username={username} avatarUrl={shown} />

        <div className="flex flex-wrap items-center gap-2">
          <form action={upAction}>
            <input
              ref={fileRef}
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPreview(URL.createObjectURL(file));
                e.target.form?.requestSubmit();
              }}
              id="avatar-file"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading" : avatarUrl ? "Change picture" : "Upload picture"}
            </Button>
          </form>

          {avatarUrl ? (
            <form action={rmAction}>
              <Button type="submit" variant="ghost" size="sm" disabled={busy}>
                {removing ? "Removing" : "Remove"}
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      <p
        role="status"
        aria-atomic="true"
        className="mt-2 text-[13px] leading-relaxed text-muted"
      >
        {state.message || "PNG, JPEG or WebP, up to 2 MB. It shows on your public profile."}
      </p>
    </div>
  );
}
