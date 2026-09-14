"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/textarea-field";
import { saveProfile, type ProfileState } from "@/app/actions/profile";

export type ProfileFormValues = {
  username: string;
  fullName: string;
  bio: string;
  location: string;
  websiteUrl: string;
  interests: string[];
  skills: string[];
};

/*
  Follows ask-settings-form.tsx: a plain form posting to a server action,
  fieldsets with a display legend, native inputs, one submit with a status
  beside it. react-hook-form is installed but unused in this codebase, and
  adding a client validation library for eight fields the server already
  validates would be the wrong kind of thorough.
*/
export function ProfileForm({ values }: { values: ProfileFormValues }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(
    saveProfile,
    { status: "idle", message: "" },
  );

  const invalid = (field: ProfileState["field"]) =>
    state.status === "error" && state.field === field;

  return (
    <form action={action} className="mt-8 space-y-10">
      {state.message ? (
        <FormAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormAlert>
      ) : null}

      <fieldset>
        <legend className="font-display text-[17px] font-semibold">
          Who you are
        </legend>

        <div className="mt-5 space-y-5">
          <Field
            id="fullName"
            name="fullName"
            label="Display name"
            defaultValue={values.fullName}
            maxLength={120}
            autoComplete="name"
            invalid={invalid("fullName")}
            hint="The name shown above your username."
          />

          <Field
            id="username"
            name="username"
            label="Username"
            defaultValue={values.username}
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9_]{3,30}"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            invalid={invalid("username")}
            hint="Lowercase letters, numbers and underscores. This is your address: /u/your-username. Changing it breaks old links."
          />

          <TextareaField
            id="bio"
            name="bio"
            label="Bio"
            limit={280}
            defaultValue={values.bio}
            invalid={invalid("bio")}
            hint="Ask Celpare may read this to tailor an answer, so write it for people rather than as instructions."
          />

          <Field
            id="location"
            name="location"
            label="Location"
            defaultValue={values.location}
            maxLength={80}
            invalid={invalid("location")}
            hint="Optional."
          />

          <Field
            id="websiteUrl"
            name="websiteUrl"
            label="Website"
            type="url"
            inputMode="url"
            placeholder="https://"
            defaultValue={values.websiteUrl}
            maxLength={2048}
            invalid={invalid("websiteUrl")}
            hint="Optional. Must start with http:// or https://"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-[17px] font-semibold">
          What you work on
        </legend>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Both are optional and both are public. They help recommendations, and
          they are not a resume.
        </p>

        <div className="mt-5 space-y-5">
          <Field
            id="interests"
            name="interests"
            label="AI interests"
            defaultValue={values.interests.join(", ")}
            maxLength={1000}
            invalid={invalid("interests")}
            hint="Comma separated, up to 20. For example: agents, image generation, evals"
          />

          <Field
            id="skills"
            name="skills"
            label="Skills"
            defaultValue={values.skills.join(", ")}
            maxLength={1000}
            invalid={invalid("skills")}
            hint="Comma separated, up to 20."
          />
        </div>
      </fieldset>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save profile"}
        </Button>
        <Link
          href="/profile"
          className="text-[14px] text-muted underline underline-offset-4 hover:text-foreground"
        >
          Back to profile
        </Link>
      </div>
    </form>
  );
}
