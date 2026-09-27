"use client";

import { useActionState, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import {
  setNotificationPreference,
  type NotificationPreferenceState,
} from "@/app/actions/notifications";
import {
  NOTIFICATION_PREFERENCES,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@/lib/notifications/shared";

/*
  One switch per notification kind (4BH). Switches that save themselves, one
  flag per call, the same shape as the privacy switches (D93) and for the same
  reason: nothing to overwrite. A switched off kind is not written at all.
*/

function Toggle({
  prefKey,
  label,
  on,
  off,
  initial,
}: {
  prefKey: NotificationPreferenceKey;
  label: string;
  on: string;
  off: string;
  initial: boolean;
}) {
  const [state, action] = useActionState<NotificationPreferenceState, FormData>(setNotificationPreference, {
    status: "idle",
    value: initial,
    message: "",
  });
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const settled = state.status === "idle" ? initial : state.value;
  const shown = isPending && optimistic !== null ? optimistic : settled;

  function onChange(next: boolean) {
    setOptimistic(next);
    const data = new FormData();
    data.set("key", prefKey);
    if (next) data.set("value", "on");
    startTransition(() => action(data));
  }

  return (
    <div className="rounded-xl border border-border px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{label}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{shown ? on : off}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden
            className={
              shown
                ? "text-[12px] font-semibold tracking-wide text-foreground"
                : "text-[12px] font-semibold tracking-wide text-muted"
            }
          >
            {shown ? "ON" : "OFF"}
          </span>
          <Switch isSelected={shown} onChange={onChange} isDisabled={isPending} aria-label={label} />
        </div>
      </div>
      {state.status === "error" ? (
        <p role="status" aria-atomic="true" className="mt-2.5 text-[13px] text-foreground">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function NotificationForm({ values }: { values: NotificationPreferences }) {
  return (
    <div className="mt-6 space-y-3">
      {NOTIFICATION_PREFERENCES.map((p) => (
        <Toggle key={p.key} prefKey={p.key} label={p.label} on={p.on} off={p.off} initial={values[p.key]} />
      ))}
    </div>
  );
}
