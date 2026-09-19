import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/card";
import type { AttachedModel, AttachedTool, PostMedia } from "@/lib/community/queries";
import { KIND_LABELS, type PostKind } from "@/lib/community/kinds";

/*
  What a post carries: its pictures or its video, and the catalogue row it is
  about.

  Both are plain server components. Nothing here needs JavaScript: a gallery of
  up to four images is a grid, and a video is a <video> with controls, which
  the browser already knows how to do better than anything written here would.
*/

export function PostMediaGallery({
  media,
  className,
}: {
  media: PostMedia[];
  className?: string;
}) {
  if (media.length === 0) return null;

  const video = media.find((m) => m.media_kind === "video");

  if (video) {
    return (
      <div className={className}>
        {/*
          preload="metadata", not "auto". Auto pulls the whole file on page
          load, and a feed with three 50 MB videos on it would cost somebody
          150 MB of their data for posts they may never play. Metadata is
          enough for the poster frame and the duration.

          No autoplay and no loop. A feed that starts playing at somebody is
          the unnecessary animation the brief rules out, and it is a real
          accessibility problem for anybody who did not ask for motion.
        */}
        <video
          src={video.url}
          controls
          preload="metadata"
          playsInline
          className="max-h-[70vh] w-full rounded-xl border border-border bg-surface"
        />
      </div>
    );
  }

  const images = media.filter((m) => m.media_kind === "image");

  return (
    <div className={className}>
      <ul
        className={
          images.length === 1
            ? "grid grid-cols-1 gap-1.5"
            : "grid grid-cols-2 gap-1.5"
        }
      >
        {images.map((image, i) => (
          <li
            key={image.id}
            className={
              /* Three images read best as one tall and two stacked, which is
                 the arrangement every feed settled on for the same reason: a
                 2x2 grid with a hole in it looks broken. */
              images.length === 3 && i === 0 ? "row-span-2" : undefined
            }
          >
            {/*
              A plain img, not next/image: the Supabase storage host would have
              to be allowlisted in next.config, and this follows the precedent
              the avatar and the tool cards already set.

              width and height come from the upload, so the browser reserves
              the right box and the feed does not jump as pictures arrive.
              loading="lazy" keeps the ones below the fold off the critical
              path.

              ALT IS EMPTY, and that is a real gap rather than an oversight.
              Nobody is asked to describe a picture yet, so there is nothing
              true to put here, and inventing a description would be worse than
              none. An empty alt at least tells a screen reader to skip it
              rather than reading out a URL. Asking for alt text in the
              composer is the fix and is recorded as a gap.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt=""
              width={image.width ?? undefined}
              height={image.height ?? undefined}
              loading="lazy"
              decoding="async"
              className={
                images.length === 1
                  ? "max-h-[70vh] w-full rounded-xl border border-border bg-surface object-contain"
                  : "size-full rounded-xl border border-border bg-surface object-cover"
              }
              style={images.length === 1 ? undefined : { aspectRatio: "1 / 1" }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/*
  The catalogue row a post is about.

  This is the thing that makes a Celpare post different from a post anywhere
  else: it is not a link somebody pasted, it is a row in the directory, so it
  carries the real name, the real tagline and a real destination inside the
  product. posts_kind_matches_attachment is what stops a post calling itself a
  tool post without one of these behind it.
*/
export function PostAttachment({
  tool,
  model,
  className,
}: {
  tool?: AttachedTool | null;
  model?: AttachedModel | null;
  className?: string;
}) {
  if (tool) {
    return (
      <Link
        href={`/tools/${tool.slug}`}
        className={`flex items-center gap-3 rounded-xl border border-border p-3 transition-colors duration-200 ease-out hover:bg-surface ${className ?? ""}`}
      >
        {tool.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={tool.logo_url}
            alt=""
            className="size-10 shrink-0 rounded-lg border border-border bg-surface object-contain"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface font-display text-[15px] font-semibold"
          >
            {tool.name.slice(0, 1).toUpperCase()}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-medium">{tool.name}</span>
            {tool.pricing ? (
              <Badge className="text-[11px]">{tool.pricing}</Badge>
            ) : null}
          </span>
          {tool.tagline ? (
            <span className="mt-0.5 block truncate text-[13px] text-muted">
              {tool.tagline}
            </span>
          ) : null}
        </span>

        <ArrowUpRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    );
  }

  if (model) {
    return (
      <Link
        href={`/explore`}
        className={`flex items-center gap-3 rounded-xl border border-border p-3 transition-colors duration-200 ease-out hover:bg-surface ${className ?? ""}`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-medium">{model.name}</span>
            {model.provider ? (
              <Badge className="text-[11px]">{model.provider}</Badge>
            ) : null}
          </span>
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    );
  }

  return null;
}

/*
  The kind label.

  Shown only when it says something the post does not already say for itself.
  A text post is a text post, and an image post already has images on it, so
  labelling either is ink for nothing. Launch, Question and Announcement are
  claims the author is making, and those are worth showing.
*/
export function PostKindBadge({ kind }: { kind: PostKind }) {
  const label = KIND_LABELS[kind];
  if (!label) return null;
  return <Badge className="text-[11px]">{label}</Badge>;
}
