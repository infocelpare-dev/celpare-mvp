import type { Metadata } from "next";
import { EntryGate } from "@/components/auth/entry-gate";

export const metadata: Metadata = {
  title: "Get started",
  description: "Create a Celpare account, log in, or look around first.",
};

export default function GetStartedPage() {
  return (
    <div>
      <h1 className="font-display text-[28px] font-bold leading-tight">
        Welcome to Celpare
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        Right tool. Right result.
      </p>

      <div className="mt-8">
        <EntryGate />
      </div>
    </div>
  );
}
