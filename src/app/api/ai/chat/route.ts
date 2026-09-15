import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ask } from "@/lib/ai/gateway";
import { INPUT_MAX_CHARS } from "@/lib/ai/config";
import { isEnabled } from "@/lib/platform/settings";

/* Reads cookies and streams, so it must never be prerendered or cached. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  message: z.string().min(1).max(INPUT_MAX_CHARS * 2),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(32_000),
      }),
    )
    .max(60)
    .optional()
    .default([]),
  conversationId: z.string().uuid().nullable().optional(),
  /* What the composer asked for. Every field optional, and every one re checked
     against the plan inside the gateway: this is a request, not a grant. */
  modes: z
    .object({
      toolSearch: z.boolean().optional(),
      webSearch: z.boolean().optional(),
      deepResearch: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    // The message cap is enforced again inside the input filter with a friendly
    // message. This bound exists to stop a multi megabyte body being parsed at
    // all, so the response here is deliberately terse.
    return NextResponse.json({ error: "That request was not valid." }, { status: 400 });
  }

  /*
    The one operational control the gateway has, and the reason it is worth a
    round trip on a path that is otherwise deliberately free of database reads:
    it is the only way to stop AI spend during an incident without a redeploy.

    It does not move the provider, the models or the keys into the database.
    Those stay environment variables read at request time, for the reasons the
    gateway page gives. This switch answers a different question: whether the
    door is open at all.

    One indexed read against a settings document, next to a call that takes
    seconds and costs money. The cost is not the concern here.
  */
  if (!(await isEnabled("features.ask_celpare"))) {
    return NextResponse.json(
      {
        error: "Ask Celpare is paused right now. Everything else on Celpare still works.",
        kind: "paused",
      },
      { status: 503 },
    );
  }

  const result = await ask({
    feature: "ask",
    message: parsed.data.message,
    history: parsed.data.history,
    conversationId: parsed.data.conversationId ?? null,
    modes: parsed.data.modes,
  });

  const setCookie = result.identity?.setCookie;

  if (!result.ok) {
    const status =
      result.kind === "rate_limited" ? 429 : result.kind === "error" ? 503 : 400;

    const response = NextResponse.json(
      { error: result.message, kind: result.kind, resetsAt: result.resetsAt ?? null },
      { status },
    );
    if (setCookie) {
      response.cookies.set(setCookie.name, setCookie.value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: setCookie.maxAge,
      });
    }
    return response;
  }

  const response = new NextResponse(result.stream, {
    headers: {
      // Newline delimited JSON, not SSE. The client reads it with a plain
      // reader, and it survives proxies that mangle event streams.
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });

  if (setCookie) {
    response.cookies.set(setCookie.name, setCookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: setCookie.maxAge,
    });
  }

  return response;
}
