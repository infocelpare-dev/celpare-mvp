import type { Metadata } from "next";
import { FollowsPage, followsMetadata } from "@/components/profile/follows-page";

/* The list and its metadata both live in one component, because followers and
   following differ by a query and a sentence and by nothing else. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return followsMetadata(username, "followers");
}

export default async function FollowersRoute({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <FollowsPage username={username} kind="followers" />;
}
