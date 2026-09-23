import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, BadgeCheck, Eye, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Stars } from "@/components/tools/tool-reviews";
import { FollowButton } from "@/components/profile/follow-button";
import { PostCard } from "@/components/community/post-card";
import { CompareLink } from "@/components/compare/compare-link";
import { formatCount, personName } from "@/lib/format";
import type { FeedPost, ViewerState } from "@/lib/community/queries";
import type {
  ModelCandidate,
  PersonCandidate,
  PostCandidate,
  Scored,
  ToolCandidate,
} from "@/lib/search/types";

/*
  The result cards.

  THEY ARE SERVER COMPONENTS AND THEY CARRY THEIR OWN TELEMETRY ATTRIBUTES. Every
  row renders data-result-type, data-result-id and data-result-position, and
  SearchTracking reads them by delegation. That is what keeps these free of hooks:
  a result card is a piece of HTML, not an interactive widget, and the only client
  components inside one are the two that genuinely need state, Follow and the
  stars.

  NO INVENTED METRICS, WHICH MATTERS MOST HERE. A card shows a rating only when
  somebody has actually rated it, views only when the tool has actually been
  opened, and a review count only when reviews exist. An unrated tool shows
  nothing where the stars would be rather than five empty ones, which reads as a
  zero score. D13 and D30, and the same rule tool-reviews.tsx already follows.

  ONE PRIMARY LINK PER CARD, STRETCHED. The card is not an anchor, because a
  second link inside an anchor is invalid HTML and a screen reader reads the outer
  one over the top of it. Instead the name link carries an ::after that covers the
  card, and any secondary control sits above it on the z axis. One accessible
  name, one large target, and the outbound link still works.
*/

const ROW =
  "relative flex gap-3.5 border-b border-border px-1 py-4 transition-colors duration-200 ease-out hover:bg-surface sm:gap-4";

/* The stretched primary link. after:content-[''] plus inset-0 is what makes the
   whole row the target without wrapping it in an anchor. */
const PRIMARY =
  "font-medium text-foreground after:absolute after:inset-0 after:content-['']";

/* ---------------------------------------------------------------------------
   Tool
   --------------------------------------------------------------------------- */

export function ToolResult({
  item,
  position,
}: {
  item: Scored<ToolCandidate>;
  position: number;
}) {
  const t = item.candidate;
  const views = t.engagement.viewsTotal;
  const rated = t.ratingCount > 0 && t.rating !== null;

  return (
    <li
      className={ROW}
      data-result-type="tool"
      data-result-id={t.id}
      data-result-position={position}
    >
      {/* The logo is a circle, per 4AJ.5, and p-2 with object-contain so a wide
          wordmark does not lose its ends to the clip. */}
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border p-2 sm:size-14">
        {t.logoUrl ? (
          <Image
            src={t.logoUrl}
            alt=""
            width={56}
            height={56}
            className="size-full rounded-full object-contain"
            unoptimized
          />
        ) : (
          <span className="text-[18px] font-semibold text-muted" aria-hidden>
            {t.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <Link href={`/tools/${t.slug}`} className={`${PRIMARY} text-[16px]`}>
            {t.name}
          </Link>
          {t.verified ? (
            <BadgeCheck
              className="size-4 shrink-0 text-foreground"
              aria-label="Verified tool"
            />
          ) : null}
        </span>

        {t.tagline ? (
          <span className="mt-0.5 line-clamp-2 block text-[14px] leading-relaxed text-muted">
            {t.tagline}
          </span>
        ) : null}

        {/* The metrics line. Each piece appears only when it is real, so a new
            tool shows a short line rather than a row of zeroes. */}
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {rated ? (
            <span className="inline-flex items-center gap-1.5">
              <Stars value={t.rating ?? 0} size={14} />
              <span className="tabular-nums text-foreground">
                {(t.rating ?? 0).toFixed(1)}
              </span>
              <span className="tabular-nums">
                {formatCount(t.ratingCount)}
                {t.ratingCount === 1 ? " review" : " reviews"}
              </span>
            </span>
          ) : null}

          {views > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Eye className="size-3.5" aria-hidden />
              {formatCount(views)}
              <span className="sr-only">views</span>
            </span>
          ) : null}

          {t.categories[0] ? <span>{t.categories[0]}</span> : null}

          {t.pricingModel ? (
            <span className="capitalize">{t.pricingModel}</span>
          ) : null}
        </span>

        {/* Why it matched. Read from the signals, so it states something true or
            nothing at all. */}
        {item.reason ? (
          <span className="mt-2 inline-block">
            <Badge>{item.reason}</Badge>
          </span>
        ) : null}
      </span>

      {/* Above the stretched link on the z axis, so it is its own target. The
          website is the one thing somebody might want without opening the tool
          page first, and an outbound click is a stronger ranking signal than a
          click through, which is why it is marked. */}
      <span className="relative z-[1] flex shrink-0 items-start gap-2">
        <CompareLink type="tool" slug={t.slug} name={t.name} className="sm:hidden" />
        <CompareLink type="tool" slug={t.slug} name={t.name} variant="button" className="hidden sm:inline-flex" />
        <span className="hidden sm:flex">
          <ButtonLink href={`/tools/${t.slug}`} variant="outline" size="sm">
            View tool
          </ButtonLink>
        </span>
      </span>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Model
   --------------------------------------------------------------------------- */

export function ModelResult({
  item,
  position,
}: {
  item: Scored<ModelCandidate>;
  position: number;
}) {
  const m = item.candidate;

  return (
    <li
      className={ROW}
      data-result-type="model"
      data-result-id={m.id}
      data-result-position={position}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border text-[18px] font-semibold text-muted sm:size-14">
        <span aria-hidden>{m.name.slice(0, 1).toUpperCase()}</span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          {/*
            There is no model page yet, so the primary link runs the search for
            the model's own name rather than pointing at a route that would 404.
            A link that goes nowhere is defect F4 in the other direction: the
            control looks real and fails when pressed.
          */}
          <Link
            href={`/search?q=${encodeURIComponent(m.name)}`}
            className={`${PRIMARY} text-[16px]`}
          >
            {m.name}
          </Link>
          {m.provider ? <Badge>{m.provider}</Badge> : null}
        </span>

        {m.description ? (
          <span className="mt-0.5 line-clamp-2 block text-[14px] leading-relaxed text-muted">
            {m.description}
          </span>
        ) : null}

        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {m.modalities.length > 0 ? (
            <span>{m.modalities.slice(0, 3).join(", ")}</span>
          ) : null}
          {m.contextWindow ? (
            <span className="tabular-nums">
              {formatCount(m.contextWindow)} context
            </span>
          ) : null}
          {m.inputPrice !== null ? (
            <span className="tabular-nums">${m.inputPrice} in / 1M</span>
          ) : null}
        </span>

        {item.reason ? (
          <span className="mt-2 inline-block">
            <Badge>{item.reason}</Badge>
          </span>
        ) : null}
      </span>

      <span className="relative z-[1] flex shrink-0 items-start gap-2">
        <CompareLink type="model" slug={m.slug} name={m.name} className="sm:hidden" />
        <CompareLink type="model" slug={m.slug} name={m.name} variant="button" className="hidden sm:inline-flex" />
      </span>

      {m.websiteUrl ? (
        <span className="relative z-[1] hidden shrink-0 items-start sm:flex">
          <a
            href={m.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-result-action="outbound"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-4 text-sm text-foreground transition-colors duration-200 ease-out hover:bg-surface"
          >
            Website
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        </span>
      ) : null}
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Person
   --------------------------------------------------------------------------- */

export function PersonResult({
  item,
  position,
  signedIn,
  following,
  followsYou = false,
  viewerId,
}: {
  item: Scored<PersonCandidate>;
  position: number;
  signedIn: boolean;
  following: boolean;
  /* They follow the viewer: Follow back, or Friends (4BA). */
  followsYou?: boolean;
  /* So the row can tell whether it is describing the person reading it. */
  viewerId?: string | null;
}) {
  const p = item.candidate;

  /*
    personName() READS SNAKE_CASE, AND A CANDIDATE IS CAMELCASE.

    Its parameter is `{ full_name?, username? }`, the shape a database row has,
    and every property on it is optional, so passing a PersonCandidate compiles
    perfectly and hands it `full_name: undefined`. Every person result then fell
    back to the handle and the row printed the handle twice, once as the name and
    once underneath it. `tsc`, eslint and the production build were all clean;
    the browser showed it in one screenshot. Same family as the lucide icon that
    could not cross the server boundary: valid on both sides, wrong at runtime.

    The adaptation is explicit and at the call site rather than by renaming the
    candidate field, because camelCase is right for a TypeScript object and
    snake_case is right for a row, and the mapping between them is what this
    module is for.
  */
  const name = personName({ full_name: p.fullName, username: p.username });

  /* When there is no name, personName falls back to the handle, and the line
     under it would then repeat it. That is the defect 4AJ.10 fixed in the page
     title, arriving in a new place. */
  const showHandle = Boolean(p.fullName?.trim());
  const isSelf = Boolean(viewerId) && viewerId === p.id;

  return (
    <li
      className={ROW}
      data-result-type="person"
      data-result-id={p.id}
      data-result-position={position}
    >
      <Avatar
        size="lg"
        fullName={p.fullName}
        username={p.username}
        avatarUrl={p.avatarUrl}
        className="shrink-0"
      />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <Link href={`/u/${p.username}`} className={`${PRIMARY} text-[16px]`}>
            {name}
          </Link>
          {p.developerVerified ? (
            <BadgeCheck
              className="size-4 shrink-0 text-foreground"
              aria-label="Verified developer"
            />
          ) : null}
        </span>

        {/* The handle, under the name. D94 keeps the two together on the profile,
            and a search result is somebody working out whether this is the person
            they meant, which is the same question. */}
        {showHandle ? (
          <span className="block truncate text-[13px] text-muted">
            @{p.username}
          </span>
        ) : null}

        {p.bio ? (
          <span className="mt-1 line-clamp-2 block text-[14px] leading-relaxed text-muted">
            {p.bio}
          </span>
        ) : null}

        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {p.followerCount > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="size-3.5" aria-hidden />
              {formatCount(p.followerCount)}
              {p.followerCount === 1 ? " follower" : " followers"}
            </span>
          ) : null}
          {p.company ? <span>{p.company}</span> : null}
          {p.isDeveloper ? <span>Developer</span> : null}
        </span>

        {item.reason ? (
          <span className="mt-2 inline-block">
            <Badge>{item.reason}</Badge>
          </span>
        ) : null}
      </span>

      {/*
        A Follow button on the row, which the followers and following lists
        deliberately do NOT have. The difference is what the two surfaces are for:
        a follow list is for going somewhere, and a search result is a decision
        about whether this is the person you wanted. Section 2 of the brief asks
        for it here, and it sits above the stretched link with its own target so a
        tap meant for the profile cannot follow somebody by accident.

        EXCEPT ON YOUR OWN ROW. You can find yourself by searching your own name,
        which is fine, and you cannot follow yourself, which the server refuses.
        Offering a control guaranteed to fail is defect F4, and it is the reason
        the profile page hides Follow and Message from the owner. Seen in a real
        browser: the viewer searched their own handle and the row offered to
        follow them. A quiet marker goes there instead, so the row is not
        silently missing the control every other row has.
      */}
      <span className="relative z-[1] shrink-0">
        {isSelf ? (
          <Badge>You</Badge>
        ) : (
          <FollowButton
            targetId={p.id}
            username={p.username}
            initialFollowing={following}
            followsYou={followsYou}
            signedIn={signedIn}
          />
        )}
      </span>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Post
   --------------------------------------------------------------------------- */

/*
  A post result is the post from the feed.

  4AK.3 is the precedent and the reason: the profile carried its own stripped
  summary of a post for months, so a video post rendered as a line of text and
  three words. PostCard is what a post looks like, so PostCard is what renders
  here, with the same viewer state the feed passes it.
*/
export function PostResult({
  item,
  post,
  position,
  viewer,
  signedIn,
}: {
  item: Scored<PostCandidate>;
  post: FeedPost;
  position: number;
  viewer: ViewerState;
  signedIn: boolean;
}) {
  return (
    <li
      data-result-type="post"
      data-result-id={item.candidate.id}
      data-result-position={position}
    >
      <PostCard post={post} viewer={viewer} signedIn={signedIn} />
    </li>
  );
}
