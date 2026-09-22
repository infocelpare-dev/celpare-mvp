import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  BadgeCheck,
  Eye,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Play,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/card";
import { Stars } from "@/components/tools/tool-reviews";
import { FollowButton } from "@/components/profile/follow-button";
import { SaveToCollection } from "@/components/collections/save-to-collection";
import { formatCount, personName, relativeTime } from "@/lib/format";
import type { ExploreTopic } from "@/lib/explore/types";
import type { ModelCandidate, PersonCandidate, ToolCandidate } from "@/lib/search/types";
import type { VideoPost } from "@/lib/community/video";
import type { FeedPost } from "@/lib/community/queries";

/*
  The Explore cards.

  WHY THESE EXIST WHEN SEARCH ALREADY HAS RESULT CARDS. Section 17 says not to
  duplicate a card when an existing component already provides the function, and
  these do not: a search result is a full width ROW in a ranked list, sized to
  carry a match reason and to be compared with the row above it. A shelf card is
  a 264px tile in a horizontal row, and putting a result row in one would give
  eight tiles of truncated nothing. Different job, different shape.

  WHAT IS NOT DUPLICATED IS EVERYTHING THAT MATTERS. The data types are search's
  own candidates and the community's own FeedPost, so there is no second
  description of a tool or a post anywhere. Save is the one SaveToCollection
  picker, Follow is the one FollowButton, and the avatar, the badge and the stars
  are the shared primitives. Nothing here talks to a table.

  A POST HAS TWO RENDERERS ON THIS PAGE AND THAT IS THE POINT. Discussions
  renders the feed's own PostCard at full width, because there it fits and
  anything less would be the stripped summary 4AK.3 had to undo. A shelf has
  264px, where the real card cannot go, so PostShelfCard below is the tile. Same
  data, same destination, two shapes. Section 18.

  NO INVENTED METRICS, AND THE PRESSURE IS HIGHEST HERE. D13 and D30 have ruled
  this out since the landing page, and a discovery surface is exactly where a
  fake rating or a made up "12k users" gets added to make a card look finished.
  A tool nobody has rated shows nothing where the stars would be, rather than
  five empty ones, which reads as a score of zero. A model shows a context window
  only if the column holds one.

  ONE PRIMARY LINK PER CARD, STRETCHED. The card is not an anchor, because a
  second link inside an anchor is invalid and a screen reader reads the outer one
  over the top of it. The name link carries an ::after covering the card and any
  secondary control sits above it on the z axis. One accessible name, one large
  target, and Save and Follow still work.
*/

/* 264px: two thirds of a 390px screen, so the next card always peeks. */
const CARD =
  "relative flex h-full w-[264px] shrink-0 snap-start flex-col rounded-2xl border border-border p-4 transition-colors duration-200 ease-out hover:bg-surface";

const PRIMARY =
  "font-medium text-foreground after:absolute after:inset-0 after:content-['']";

/* Secondary controls sit above the stretched link so they are their own target.
   The ux guidance asks for 8px between adjacent touch targets, which the gap
   between the footer controls provides. */
const OVER = "relative z-[1]";

/* ---------------------------------------------------------------------------
   Tool
   --------------------------------------------------------------------------- */

export function ToolCard({
  tool,
  reason,
  saved,
  signedIn,
}: {
  tool: ToolCandidate;
  reason: string | null;
  saved: boolean;
  signedIn: boolean;
}) {
  const rated = tool.ratingCount > 0 && tool.rating !== null;
  const views = tool.engagement.viewsTotal;

  return (
    <li className={CARD}>
      <div className="flex items-start gap-3">
        {/* A circle with padding and object-contain, per 4AJ.5, so a wide
            wordmark does not lose its ends to the clip. */}
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border p-1.5">
          {tool.logoUrl ? (
            <Image
              src={tool.logoUrl}
              alt=""
              width={44}
              height={44}
              className="size-full rounded-full object-contain"
              unoptimized
            />
          ) : (
            <span className="text-[16px] font-semibold text-muted" aria-hidden>
              {tool.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Link href={`/tools/${tool.slug}`} className={`${PRIMARY} text-[15px]`}>
              {tool.name}
            </Link>
            {tool.verified ? (
              <BadgeCheck
                className="size-4 shrink-0 text-foreground"
                aria-label="Verified tool"
              />
            ) : null}
          </span>
          {tool.categories[0] ? (
            <span className="mt-0.5 block truncate text-[12px] text-muted">
              {tool.categories[0]}
            </span>
          ) : null}
        </span>
      </div>

      {tool.tagline ? (
        <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-muted">
          {tool.tagline}
        </p>
      ) : null}

      {/* Pushed to the bottom so cards of different text lengths still line their
          footers up, which is what stops a shelf looking ragged. */}
      <div className="mt-auto pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {rated ? (
            <span className="inline-flex items-center gap-1">
              <Stars value={tool.rating ?? 0} size={13} />
              <span className="tabular-nums text-foreground">
                {(tool.rating ?? 0).toFixed(1)}
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

          {tool.pricingModel ? (
            <span className="capitalize">{tool.pricingModel}</span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {reason ? <Badge>{reason}</Badge> : <span />}
          <span className={OVER}>
            <SaveToCollection
              entityType="tool"
              entityId={tool.id}
              initialSaved={saved}
              signedIn={signedIn}
              variant="icon"
            />
          </span>
        </div>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Model
   --------------------------------------------------------------------------- */

/*
  There is no model page yet, so the primary link runs a search for the model's
  own name rather than pointing at a route that would 404. That is the same
  decision the search result card took, and for the same reason: a link that
  looks real and fails when pressed is defect F4.
*/
export function ModelCard({
  model,
  reason,
  saved,
  signedIn,
}: {
  model: ModelCandidate;
  reason: string | null;
  saved: boolean;
  signedIn: boolean;
}) {
  return (
    <li className={CARD}>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-[16px] font-semibold text-muted">
          <span aria-hidden>{model.name.slice(0, 1).toUpperCase()}</span>
        </span>

        <span className="min-w-0 flex-1">
          <Link
            href={`/search?q=${encodeURIComponent(model.name)}`}
            className={`${PRIMARY} block truncate text-[15px]`}
          >
            {model.name}
          </Link>
          {model.provider ? (
            <span className="mt-0.5 block truncate text-[12px] text-muted">
              {model.provider}
            </span>
          ) : null}
        </span>
      </div>

      {model.description ? (
        <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-muted">
          {model.description}
        </p>
      ) : null}

      <div className="mt-auto pt-3">
        {/* Only what the row actually holds. Nothing here infers a benchmark, a
            rating or a capability, which section 10 rules out explicitly. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {model.modalities.length > 0 ? (
            <span className="truncate">{model.modalities.slice(0, 2).join(", ")}</span>
          ) : null}
          {model.contextWindow ? (
            <span className="tabular-nums">
              {formatCount(model.contextWindow)} context
            </span>
          ) : null}
          {model.inputPrice !== null ? (
            <span className="tabular-nums">${model.inputPrice} in / 1M</span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          {model.websiteUrl ? (
            <a
              href={model.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${OVER} inline-flex items-center gap-1 text-[13px] text-foreground underline underline-offset-4`}
            >
              Website
              <ArrowUpRight className="size-3.5" aria-hidden />
              <span className="sr-only">for {model.name}, opens in a new tab</span>
            </a>
          ) : reason ? (
            <Badge>{reason}</Badge>
          ) : (
            <span />
          )}
          <span className={OVER}>
            <SaveToCollection
              entityType="model"
              entityId={model.id}
              initialSaved={saved}
              signedIn={signedIn}
              variant="icon"
            />
          </span>
        </div>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Person
   --------------------------------------------------------------------------- */

export function PersonCard({
  person,
  following,
  signedIn,
  viewerId,
}: {
  person: PersonCandidate;
  following: boolean;
  signedIn: boolean;
  viewerId: string | null;
}) {
  /*
    personName() READS SNAKE_CASE AND A CANDIDATE IS CAMELCASE.

    Every property on its parameter is optional, so passing the candidate
    straight in compiles perfectly and hands it full_name: undefined, and every
    card then falls back to the handle and prints it twice. That happened on the
    search result card and the browser showed it in one screenshot while tsc,
    eslint and the build were all clean. The adaptation is explicit and at the
    call site for that reason.
  */
  const name = personName({ full_name: person.fullName, username: person.username });
  const showHandle = Boolean(person.fullName?.trim());
  const isSelf = Boolean(viewerId) && viewerId === person.id;

  return (
    <li className={CARD}>
      <div className="flex items-start gap-3">
        <Avatar
          size="md"
          fullName={person.fullName}
          username={person.username}
          avatarUrl={person.avatarUrl}
          className="shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/u/${person.username}`}
              className={`${PRIMARY} text-[15px]`}
            >
              {name}
            </Link>
            {person.developerVerified ? (
              <BadgeCheck
                className="size-4 shrink-0 text-foreground"
                aria-label="Verified developer"
              />
            ) : null}
          </span>
          {showHandle ? (
            <span className="block truncate text-[12px] text-muted">
              @{person.username}
            </span>
          ) : null}
        </span>
      </div>

      {person.bio ? (
        <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-muted">
          {person.bio}
        </p>
      ) : null}

      <div className="mt-auto pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {person.followerCount > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="size-3.5" aria-hidden />
              {formatCount(person.followerCount)}
              {person.followerCount === 1 ? " follower" : " followers"}
            </span>
          ) : null}
          {person.isDeveloper ? <span>Developer</span> : null}
        </div>

        {/*
          NOT ON YOUR OWN CARD. You cannot follow yourself and the server refuses
          it, so offering the control is defect F4. A quiet marker goes there
          instead, rather than the card silently missing what every other card
          has. The search result card took the same decision after the founder
          found their own row offering to follow them.
        */}
        <div className={`${OVER} mt-3 flex justify-end`}>
          {isSelf ? (
            <Badge>You</Badge>
          ) : (
            <FollowButton
              targetId={person.id}
              username={person.username}
              initialFollowing={following}
              signedIn={signedIn}
            />
          )}
        </div>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Topic
   --------------------------------------------------------------------------- */

/*
  A topic or a category, drawn the same and pointing at different places.

  The count is rendered only when there is one. A category carries null rather
  than 0, because 0 would be a false statement about a category that has tools in
  it, and the card shows nothing instead of a zero.
*/
export function TopicCard({ topic }: { topic: ExploreTopic }) {
  return (
    <li className="relative">
      <Link
        href={topic.href}
        className="flex h-full flex-col rounded-2xl border border-border p-3.5 transition-colors duration-200 ease-out hover:bg-surface sm:p-4"
      >
        <span className="text-[14px] font-medium">{topic.name}</span>
        {topic.description ? (
          <span className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
            {topic.description}
          </span>
        ) : null}
        <span className="mt-auto pt-2 text-[12px] text-muted">
          {topic.count !== null && topic.countNoun ? (
            <span className="tabular-nums">
              {formatCount(topic.count)} {topic.count === 1 ? "post" : topic.countNoun}
            </span>
          ) : (
            /* A category has no count, so it says what it is instead of leaving
               the line blank and the card looking unfinished. */
            <span>Category</span>
          )}
        </span>
      </Link>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Post, in a shelf
   --------------------------------------------------------------------------- */

/*
  A post as a shelf tile.

  THE FIRST VERSION PUT THE FEED'S PostCard IN THE SHELF AND IT WAS WRONG. Seen
  in a browser: three post cards at about 460px tall beside a tool card at 200,
  so the row was three posts and a sliver, every shorter card had a well of empty
  space under it, and the post that happened to be newest owned the whole shelf.
  A horizontal row only reads as a row when the tiles are the same shape.

  THIS IS NOT THE MISTAKE 4AK.3 FIXED, and the difference is worth being precise
  about. That was the profile rendering its own stripped summary INSTEAD of the
  real card in a full width list, where the real card fitted perfectly and a
  video post came out as three words of text. Here there is no width for the real
  card at all, the full post is one tap away, and Discussions on this same page
  renders the genuine PostCard. Section 18 asks for the renderer that suits the
  object; in 264px, this is it.

  IT CARRIES NO ACTIONS. Like, save and share live on the post and in
  Discussions. Putting them on a tile this size would mean four more targets
  inside a card whose whole job is to get you to the post, and every one of them
  would be a second copy of a control that already exists.

  THE COUNTS ARE REAL AND HIDDEN AT ZERO, which is the post card's own rule.
*/
export function PostShelfCard({ post }: { post: FeedPost }) {
  const author = post.author;
  const name = author ? personName(author) : "Someone";
  const media = post.media[0] ?? null;

  return (
    <li className={CARD}>
      <div className="flex items-center gap-2">
        <Avatar
          size="sm"
          fullName={author?.full_name}
          username={author?.username}
          avatarUrl={author?.avatar_url}
          className="shrink-0"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
        {post.topic ? (
          <span className="shrink-0 text-[12px] text-muted">{post.topic.name}</span>
        ) : null}
      </div>

      <Link href={`/community/${post.id}`} className={`${PRIMARY} mt-2.5 text-[13px]`}>
        <span className="line-clamp-4 font-normal leading-relaxed text-foreground">
          {post.body}
        </span>
      </Link>

      <div className="mt-auto pt-3">
        {/* Says what is attached rather than loading it. A shelf of eight tiles
            that each pulled a video is the preload discipline section 33 rules
            out, and the tile is a doorway, not a player. */}
        {media ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            {media.media_kind === "video" ? (
              <Play className="size-3.5" aria-hidden />
            ) : (
              <ImageIcon className="size-3.5" aria-hidden />
            )}
            {media.media_kind === "video" ? "Video" : "Image"}
          </span>
        ) : null}

        <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
          {post.like_count > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Heart className="size-3.5" aria-hidden />
              {formatCount(post.like_count)}
              <span className="sr-only">likes</span>
            </span>
          ) : null}
          {post.comment_count > 0 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MessageCircle className="size-3.5" aria-hidden />
              {formatCount(post.comment_count)}
              <span className="sr-only">comments</span>
            </span>
          ) : null}
          <span
            className="ms-auto shrink-0"
            suppressHydrationWarning
            title={post.created_at}
          >
            {relativeTime(post.created_at)}
          </span>
        </div>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Video
   --------------------------------------------------------------------------- */

/*
  An entry into the vertical viewer, and nothing more.

  Section 14: Explore decides the discovery entry, and playback, analytics and
  every action stay with the viewer 4AO built. So this card has no player, no
  controls and no events. It is a link to /community/video/[id], which is where
  all of that already lives.

  THE FIRST TWO CARDS LOAD A POSTER FRAME AND THE REST DO NOT. `preload`
  metadata opens a connection and pulls the header of the file, which is cheap
  once and eight times is not, and section 33 says not to preload distant videos.
  Two is the number visible on a 390px screen before the row is scrolled, and it
  is the same discipline the viewer itself applies when it keeps at most three
  real players alive. A card past the second draws the play glyph on a plain
  surface: no bytes, and tapping it opens the real player anyway.

  The poster video is muted, has no controls and is aria-hidden: it is a still
  frame that happens to be produced by a video element, and announcing it as
  media would offer a screen reader a player that cannot be operated.
*/
export function VideoCard({
  post,
  index,
}: {
  post: VideoPost;
  index: number;
}) {
  const author = post.author;
  const name = author ? personName(author) : "Someone";
  const caption = post.body.trim();
  const withPoster = index < 2;

  return (
    <li className={`${CARD} overflow-hidden p-0`}>
      <div className="relative aspect-[9/13] w-full shrink-0 bg-surface">
        {withPoster ? (
          /*
            #t=0.1 IS WHAT MAKES A FRAME APPEAR, and without it these tiles are
            four black rectangles. Seen in a browser: preload="metadata" fetches
            the header and the duration and stops, so Chrome has no decoded
            frame to paint and draws the poster colour. A media fragment asks it
            to seek to 0.1s, which forces exactly one frame to decode.

            0.1 rather than 0, because the first frame of an encoded clip is
            often black by construction, and a tenth of a second in is past it.
          */
          <video
            src={`${post.video.url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            aria-hidden
            tabIndex={-1}
            className="size-full object-cover"
          />
        ) : null}

        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="size-5 fill-current" />
          </span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3.5">
        <Link href={`/community/video/${post.id}`} className={`${PRIMARY} text-[14px]`}>
          {caption ? (
            <span className="line-clamp-2">{caption}</span>
          ) : (
            <span>
              Video by {name}
              <span className="sr-only">, opens in the vertical viewer</span>
            </span>
          )}
        </Link>

        <span className="mt-auto flex items-center gap-2 pt-2 text-[12px] text-muted">
          <Avatar
            size="sm"
            fullName={author?.full_name}
            username={author?.username}
            avatarUrl={author?.avatar_url}
            className="size-6 text-[11px]"
          />
          <span className="truncate">{name}</span>
        </span>
      </div>
    </li>
  );
}
