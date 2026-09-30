import { getRecommendations, type RecommendationView } from "@/lib/recommend/server/engine";
import type { EntityRef, EntityType, RecommendationRequest } from "@/lib/recommend/types";
import { RecommendationList } from "./recommendations";

/*
  The recommendation block on a tool or model page (4BK, guide 17 section 1).

    Alternatives        another product for the same job (strategy alternative)
    Similar             close in what it does, excluding the alternatives above
    You may also like   signed in only, the person's interests near this page
    Related             the other type, only where the catalogue states a link

  Each list excludes what the lists above it already showed, so a card appears
  once per page. The alternatives run first; similar and related then run in
  parallel; the personal list last. The index is cached and the viewer is read
  once per request (engine.ts), so this is milliseconds after the first load.
*/

type Props = {
  type: EntityType;
  id: string;
  slug: string;
  name: string;
  viewerId: string | null;
  signedIn: boolean;
  debug: boolean;
};

const refsOf = (v: RecommendationView): EntityRef[] => (v.ok ? v.result.items.map((i) => i.ref) : []);

export async function ProfileRecommendations({ type, id, slug, name, viewerId, signedIn, debug }: Props) {
  const surface: RecommendationRequest["surface"] = type === "tool" ? "tool_profile" : "model_profile";
  const seed: EntityRef = { type, id };
  const other: EntityType = type === "tool" ? "model" : "tool";
  const base: Pick<RecommendationRequest, "surface" | "seeds" | "debug"> = { surface, seeds: [seed], debug };

  const alternatives = await getRecommendations({ ...base, strategy: "alternative", entityTypes: [type], limit: 4, section: "alternatives" }, viewerId);
  const [similar, related] = await Promise.all([
    getRecommendations({ ...base, strategy: "similar", entityTypes: [type], limit: 6, exclude: refsOf(alternatives), section: "similar" }, viewerId),
    getRecommendations({ ...base, strategy: "related", entityTypes: [other], limit: 4, section: "related" }, viewerId),
  ]);
  const personal = signedIn
    ? await getRecommendations(
        { ...base, strategy: "personalized", entityTypes: [type], limit: 4, exclude: [...refsOf(alternatives), ...refsOf(similar)], section: "for-you" },
        viewerId,
      )
    : null;

  const compareWith = { type, slug };
  const noun = type === "tool" ? "tools" : "models";

  return (
    <>
      <RecommendationList
        view={alternatives}
        request={{ ...base, strategy: "alternative", entityTypes: [type], limit: 4, section: "alternatives" }}
        viewerId={viewerId}
        signedIn={signedIn}
        title={type === "tool" ? `Alternatives to ${name}` : "Alternative models"}
        blurb={type === "tool" ? "Other tools for the same job, in the same category." : "Other models for the same work, outside this model's own line."}
        compareWith={compareWith}
        debug={debug}
      />
      <RecommendationList
        view={similar}
        request={{ ...base, strategy: "similar", entityTypes: [type], limit: 6, section: "similar" }}
        viewerId={viewerId}
        signedIn={signedIn}
        title={`Similar ${noun}`}
        blurb={`Close in what they do and what is recorded about them.`}
        compareWith={compareWith}
        debug={debug}
      />
      {personal ? (
        <RecommendationList
          view={personal}
          request={{ ...base, strategy: "personalized", entityTypes: [type], limit: 4, section: "for-you" }}
          viewerId={viewerId}
          signedIn={signedIn}
          title="You may also like"
          blurb="From what you have saved, compared and opened, kept close to this page."
          debug={debug}
        />
      ) : null}
      <RecommendationList
        view={related}
        request={{ ...base, strategy: "related", entityTypes: [other], limit: 4, section: "related" }}
        viewerId={viewerId}
        signedIn={signedIn}
        title={type === "tool" ? "Related models" : "Related tools"}
        blurb={type === "tool" ? "Models whose maker or line this tool's own listing names." : "Tools whose own listing names this model's maker or line."}
        debug={debug}
      />
    </>
  );
}
