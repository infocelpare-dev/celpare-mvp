"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PLANS_COOKIE } from "@/lib/pricing/due";

/* Continue free on /plans (phase PLANS, D228): the plans are done for this login. */
export async function dismissPlans(): Promise<void> {
  (await cookies()).delete(PLANS_COOKIE);
  redirect("/community");
}
