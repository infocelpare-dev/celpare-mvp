import Link from "next/link";
import { CalendarDays, Link2, Lock, MapPin } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { signOut } from "@/app/actions/auth";
import { Badge, Card, ChipLink } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Tabs, type TabIconName, type TabItem } from "@/components/ui/tabs";
import { formatCount, personName } from "@/lib/format";
import { FollowButton } from "@/components/profile/follow-button";
import { MessageButton } from "@/components/profile/message-button";
import { DeveloperModeToggle } from "@/components/profile/developer-mode-toggle";
import { ClearRecent } from "@/components/profile/clear-recent";
import { RecentList } from "@/components/profile/recent-list";
import type {
  CollectionRow,
  CommentRow,
  ModelRow,
  PostRow,
  Profile,
  RecentRow,
  TabKey,
  ToolRow,
} from "@/lib/profile/queries";

/*
  One view, rendered by both /profile and /u/[username]. The only difference
  between them is isOwner, which decides the Edit or Follow control and which
  tabs exist at all.

  Nothing on this page is invented (D13, D30). A person with no posts gets an
  empty state that says so. A count of zero is not rendered. No invented
  reputation, no activity graph, no "member since" badge that means nothing.
*/

const TAB_LABELS: Record<TabKey, string> = {
  posts: "Posts",
  replies: "Replies",
  media: "Media",
  reposts: "Reposts",
  liked: "Liked",
  saved: "Saved",
  tools: "Tools",
  models: "Models",
  collections: "Collections",
  recent: "Recent",
};

/*
  An icon per section, founder instruction 2026-09-18, so the whole set is
  legible as tiles at phone width rather than as a row of words that runs off
  the screen. Each one is decorative: the label is always beside it, at both
  widths, so none of these carries meaning on its own.

  Two of them are deliberately the same marks the developer nav uses: Wrench
  for tools and Boxes for models. A person moving between their profile and
  their developer workspace should not have to learn the icon twice.
*/
const TAB_ICONS: Record<TabKey, TabIconName> = {
  posts: "posts",
  replies: "replies",
  media: "media",
  reposts: "reposts",
  liked: "liked",
  saved: "saved",
  tools: "tools",
  models: "models",
  collections: "collections",
  recent: "recent",
};
function joinedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/* The host, so a link reads as a place rather than as a query string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProfileView({
  profile,
  isOwner,
  viewerSignedIn,
  following,
  tabs,
  activeTab,
  rows,
  featuredTools,
  basePath,
  submissionCount = 0,
}: {
  profile: Profile;
  isOwner: boolean;
  viewerSignedIn: boolean;
  following: boolean;
  tabs: TabKey[];
  activeTab: TabKey;
  rows: {
    posts?: PostRow[];
    comments?: CommentRow[];
    tools?: ToolRow[];
    models?: ModelRow[];
    collections?: CollectionRow[];
    recent?: RecentRow[];
  };
  featuredTools: ToolRow[];
  basePath: string;
  /* Owner only, and only used to explain why Developer Mode is locked. */
  submissionCount?: number;
}) {

  /* Every sentence on this page names the person too. One definition, so the
     prose and the heading cannot drift apart. */
  const displayName = personName(profile);

  /*
    A private account, seen by somebody else. The picture, the name, the
    @username, the counts and a Follow button stay: that is what makes the
    account findable and followable at all, and the founder named exactly those.
    Everything a person WROTE goes: bio, location, website, interests, skills,
    featured tools and every section.

    Following a private account is allowed and shows the follower nothing.
    There is no approval flow, because none was asked for, and half an approval
    system is worse than none. Tracked as a gap.
  */
  const hidden = profile.is_private && !isOwner;
  /*
    Follows are the one thing a PRIVATE account may hide and a public one may
    not. Founder rule 2026-09-18: the counts are part of what a public profile
    owes, and hiding them is something you get by going private. Mirrors the
    'follows' branch of profile_shares(), which is the control.
  */
  const showFollows = isOwner || !profile.is_private || profile.show_follows;

  const tabItems: TabItem[] = tabs.map((key) => ({
    key,
    label: TAB_LABELS[key],
    icon: TAB_ICONS[key],
    href: key === "posts" ? basePath : `${basePath}?tab=${key}`,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <Avatar
          size="xl"
          fullName={profile.full_name}
          username={profile.username}
          avatarUrl={profile.avatar_url}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {/*
                THE NAME IS BACK, AND THE HANDLE IS SEEN HERE AND NOWHERE ELSE.
                Founder instruction 2026-09-19, reversing the instruction of
                the same morning that had made the handle the only identity.

                The rule is a split rather than a swap: the name is what every
                other surface shows, and the @username is what the person who
                opens this profile sees. So the heading is the name and the
                handle sits under it, where somebody who came to find out who
                this is will look, rather than being repeated on every card in
                a feed they scroll past.

                personName falls back to the handle when full_name is empty, so
                an email signup that never supplied one still has a heading.
                The line below is then suppressed rather than printed twice.
              */}
              <h1 className="font-display text-[clamp(1.5rem,4vw,2rem)] font-semibold leading-tight">
                {displayName}
              </h1>
              {displayName !== `@${profile.username}` ? (
                <p className="mt-0.5 text-[15px] text-muted">@{profile.username}</p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {isOwner ? (
                <>
                  <ButtonLink href="/profile/edit" variant="outline" size="sm">
                    Edit profile
                  </ButtonLink>

                  {/*
                    LOG OUT LIVES HERE NOW, founder instruction 2026-09-19. It
                    used to sit in the top bar of every page, where it was one
                    stray tap from ending a session while reading the feed.
                    It is an account action, so it belongs on the account.

                    Only the owner sees it: isOwner is what decides it, and on
                    /u/[username] that is the same person looking at their own
                    public profile. There is no harm in it appearing there too.

                    A ghost button rather than an outline one, so it does not
                    compete with Edit profile for the same press.
                  */}
                  <form action={signOut}>
                    <Button variant="ghost" size="sm" type="submit">
                      Log out
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <FollowButton
                    targetId={profile.id}
                    username={profile.username}
                    initialFollowing={following}
                    signedIn={viewerSignedIn}
                  />

                  {/*
                    Message, beside Follow. Founder instruction 2026-09-19.
                    Signed in only: the action refuses a signed out visitor
                    anyway, and Follow beside it is already the route to the
                    gate, so this is absent rather than a second dead end.
                  */}
                  {viewerSignedIn ? (
                    <MessageButton targetId={profile.id} name={displayName} />
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/*
            The developer badge is derived from is_developer, a real flag on
            the account. It is never something a person types about themselves
            (D72). There is no self declared role field anywhere on this page.

            The owner gets the switch itself right here, founder instruction
            2026-09-14: it has to be visible and flippable without going into
            settings first. Everyone else sees only the badge, and only when it
            is on.
          */}
          {profile.developer_profiles ? (
            <div className="mt-3">
              <Badge tone="accent">Developer</Badge>
            </div>
          ) : null}


          {profile.bio && !hidden ? (
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
              {profile.bio}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] text-muted">
            {profile.location && !hidden ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {profile.location}
              </span>
            ) : null}

            {profile.website_url && !hidden ? (
              <a
                href={profile.website_url}
                target="_blank"
                /*
                  noopener is the one that matters: a target=_blank link hands
                  the new tab a window.opener reference back into this page.
                  ugc because the URL is written by the person, not by us.
                */
                rel="noopener noreferrer nofollow ugc"
                className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-4 hover:text-muted"
              >
                <Link2 className="size-4 shrink-0" aria-hidden />
                {hostOf(profile.website_url)}
              </a>
            ) : null}

            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              Joined {joinedOn(profile.created_at)}
            </span>
          </div>

          {/*
            Follower and following counts.

            Offered only to a private account, per the founder's rule. Be clear
            about what hiding them is worth: the counts are plain columns on
            `profiles`, which is publicly readable, so this is a rendering
            decision and NOT a boundary. What it does control for real is the
            `follows` table itself, whose select policy needs both parties to be
            sharing, so a follower LIST cannot be enumerated. Closing the count
            properly means moving profile reads behind a view, tracked as G46
            rather than half done here.
          */}
          {showFollows ? (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
              <span>
                <strong className="font-medium tabular-nums">
                  {formatCount(profile.following_count)}
                </strong>{" "}
                <span className="text-muted">Following</span>
              </span>
              <span>
                <strong className="font-medium tabular-nums">
                  {formatCount(profile.follower_count)}
                </strong>{" "}
                <span className="text-muted">
                  {profile.follower_count === 1 ? "Follower" : "Followers"}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/*
        Developer Mode lives on the profile, per founder instruction: the
        developer sections were removed from the global navigation, so this is
        the way in and the way back out.
      */}
      {isOwner ? (
        <div className="mt-7">
          <DeveloperModeToggle
            initial={profile.is_developer}
            hasAgreed={Boolean(profile.developer_profiles)}
            submissionCount={submissionCount}
          />
          {profile.is_developer ? (
            <div className="mt-3">
              <ButtonLink href="/developer" variant="outline" size="sm">
                Open developer workspace
              </ButtonLink>
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        The private account wall. Everything below it is skipped, so there is
        one place that decides rather than a `hidden &&` on each section.

        It says what is true and stops. No follower teaser, no blurred posts,
        no count of what is being withheld: that is a different product's idea
        of a private account, and it leaks the thing it pretends to hide.
      */}
      {hidden ? (
        <div className="mt-8 rounded-2xl border border-border px-6 py-12 text-center">
          <span
            aria-hidden
            className="mx-auto flex size-10 items-center justify-center rounded-full border border-border text-muted"
          >
            <Lock className="size-5" />
          </span>
          <p className="mt-4 font-display text-[17px] font-semibold">
            This account is private
          </p>
          <p className="mx-auto mt-2 max-w-[42ch] text-[14px] leading-relaxed text-muted">
            {displayName} has chosen not to show their posts, replies or saved
            tools. You can still follow them.
          </p>
        </div>
      ) : (
      <>
      {/* Interests and skills, both optional, both plain labels */}
      {profile.interests.length > 0 || profile.skills.length > 0 ? (
        <div className="mt-7 space-y-4">
          {profile.interests.length > 0 ? (
            <LabelledChips
              title="Interested in"
              items={profile.interests}
              hrefFor={(v) => `/explore?q=${encodeURIComponent(v)}`}
            />
          ) : null}
          {profile.skills.length > 0 ? (
            <LabelledList title="Skills" items={profile.skills} />
          ) : null}
        </div>
      ) : null}

      {featuredTools.length > 0 ? (
        <section className="mt-8" aria-labelledby="featured-tools">
          <h2 id="featured-tools" className="font-display text-[17px] font-semibold">
            Featured tools
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {featuredTools.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-8">
        <Tabs
          items={tabItems}
          active={activeTab}
          label={`${displayName} profile sections`}
        />

        <div className="py-6">
          <TabPanel
            tab={activeTab}
            rows={rows}
            isOwner={isOwner}
            displayName={displayName}
          />
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function LabelledChips({
  title,
  items,
  hrefFor,
}: {
  title: string;
  items: string[];
  hrefFor: (value: string) => string;
}) {
  return (
    <div>
      <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <ChipLink key={item} href={hrefFor(item)}>
            {item}
          </ChipLink>
        ))}
      </div>
    </div>
  );
}

function LabelledList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item}>{item}</Badge>
        ))}
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolRow }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="flex items-start gap-3 rounded-2xl border border-border p-4 transition-colors duration-200 ease-out hover:bg-surface"
    >
      {tool.logo_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={tool.logo_url}
          alt=""
          loading="lazy"
          className="size-9 shrink-0 rounded-lg border border-border object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface font-display text-[15px] font-semibold text-muted"
        >
          {tool.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium">{tool.name}</span>
        {tool.tagline ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-muted">
            {tool.tagline}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function ModelCard({ model }: { model: ModelRow }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{model.name}</span>
        {/* The provider is a fact from the record, so a badge and not a chip. */}
        {model.provider ? <Badge>{model.provider}</Badge> : null}
      </div>
      {model.description ? (
        <p className="mt-1.5 text-[13px] leading-snug text-muted">{model.description}</p>
      ) : null}
    </div>
  );
}

function PostList({ posts }: { posts: PostRow[] }) {
  return (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li key={post.id}>
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Link href={`/community/${post.id}`} className="hover:text-foreground">
                {relative(post.created_at)}
              </Link>
              {/* Only the owner ever sees this, and only because posts_select_own
                  lets them. Being told is better than quietly disappearing. */}
              {post.status !== "visible" ? (
                <Badge>{post.status === "hidden" ? "Hidden, under review" : "Removed"}</Badge>
              ) : null}
            </div>

            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">
              {post.body}
            </p>

            {post.link_url ? (
              <a
                href={post.link_url}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="mt-3 inline-flex items-center gap-1.5 text-[14px] text-foreground underline underline-offset-4 hover:text-muted"
              >
                <Link2 className="size-4 shrink-0" aria-hidden />
                {hostOf(post.link_url)}
              </a>
            ) : null}

            {/* Counts are hidden at zero, per 10-community.md section 9. */}
            <div className="mt-3 flex gap-4 text-[13px] text-muted">
              {post.like_count > 0 ? <span>{formatCount(post.like_count)} likes</span> : null}
              {post.comment_count > 0 ? (
                <span>{formatCount(post.comment_count)} comments</span>
              ) : null}
              {post.repost_count > 0 ? (
                <span>{formatCount(post.repost_count)} reposts</span>
              ) : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-border px-6 py-12 text-center">
      <p className="font-display text-[17px] font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-[42ch] text-[14px] leading-relaxed text-muted">
        {detail}
      </p>
    </div>
  );
}

function TabPanel({
  tab,
  rows,
  isOwner,
  displayName,
}: {
  tab: TabKey;
  rows: {
    posts?: PostRow[];
    comments?: CommentRow[];
    tools?: ToolRow[];
    models?: ModelRow[];
    collections?: CollectionRow[];
    recent?: RecentRow[];
  };
  isOwner: boolean;
  displayName: string;
}) {
  const who = isOwner ? "You have" : `${displayName} has`;

  /*
    Recent. Owner only, and it is the only tab whose contents nobody else can
    ever be shown: visibleTabs never offers it on another profile, and
    my_recent_activity answers for the caller rather than for the profile being
    viewed, so there is no combination of URL and session that reaches somebody
    else's list.
  */
  if (tab === "recent") {
    const recent = rows.recent ?? [];
    if (recent.length === 0) {
      return (
        <EmptyState
          title="Nothing here yet"
          detail="Searches you run and tools you open show up here, so you can get back to them. Only you can see this."
        />
      );
    }
    return (
      <div>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Only you can see this. It is never shown on your public profile.
        </p>
        <RecentList rows={recent} />

        <div className="mt-5">
          <ClearRecent />
        </div>
      </div>
    );
  }

  if (tab === "replies") {
    const comments = rows.comments ?? [];
    if (comments.length === 0) {
      return (
        <EmptyState
          title="No replies yet"
          detail={`${who} not replied to anything yet. Replies to posts in the community show up here.`}
        />
      );
    }
    return (
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id}>
            <Card className="p-4 sm:p-5">
              <Link
                href={`/community/${c.post_id}`}
                className="text-[13px] text-muted hover:text-foreground"
              >
                {relative(c.created_at)}, in reply to a post
              </Link>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">
                {c.body}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  if (tab === "tools") {
    const tools = rows.tools ?? [];
    if (tools.length === 0) {
      return (
        <EmptyState
          title="No saved tools yet"
          detail="Tools you save from the catalogue are kept here. Free accounts can save five."
        />
      );
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {tools.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
      </div>
    );
  }

  if (tab === "models") {
    const models = rows.models ?? [];
    if (models.length === 0) {
      return (
        <EmptyState
          title="No saved models yet"
          detail="The model directory is Phase 5. Once it lands, models you save show up here beside your tools."
        />
      );
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {models.map((m) => (
          <ModelCard key={m.id} model={m} />
        ))}
      </div>
    );
  }

  if (tab === "collections") {
    const collections = rows.collections ?? [];
    if (collections.length === 0) {
      return (
        <EmptyState
          title="No collections yet"
          detail="A collection groups tools around a job you are trying to do. Yours will be listed here."
        />
      );
    }
    return (
      <ul className="space-y-3">
        {collections.map((c) => (
          <li key={c.id}>
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {!c.is_public ? <Badge>Private</Badge> : null}
              </div>
              {c.description ? (
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                  {c.description}
                </p>
              ) : null}
              {c.item_count > 0 ? (
                <p className="mt-2 text-[13px] text-muted">
                  {formatCount(c.item_count)} {c.item_count === 1 ? "tool" : "tools"}
                </p>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  const posts = rows.posts ?? [];
  if (posts.length === 0) {
    const detail: Record<string, string> = {
      posts: `${who} not posted anything yet.`,
      media: `${who} not shared any links yet. Posts that carry a link show up here.`,
      reposts: `${who} not reposted anything yet.`,
      liked: "Posts you like are kept here, and only you can see this list.",
      saved: "Posts you save are kept here, and only you can see this list.",
    };
    return (
      <EmptyState
        title={`Nothing in ${TAB_LABELS[tab].toLowerCase()} yet`}
        detail={detail[tab] ?? ""}
      />
    );
  }
  return <PostList posts={posts} />;
}
