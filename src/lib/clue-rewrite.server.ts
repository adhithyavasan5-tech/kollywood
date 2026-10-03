/** Rewrites first clues into easy English + Tamil with Lovable AI, never naming the film or its cast. */
type Row = {
  id: number;
  title: string;
  aliases: string[];
  year: number | null;
  story: string;
  overview: string | null;
  director: string;
  hero: string;
  heroine: string;
  genres: string[];
};

function mask(text: string, r: Row) {
  let out = text;
  for (const n of [r.title, ...r.aliases, r.hero, r.heroine, r.director]) {
    if (!n || n.length < 3) continue;
    out = out.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "this film");
  }
  return out;
}

async function rewrite(r: Row, apiKey: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_object" } },
      instructions:
        'You write EASY first clues for a Tamil movie guessing game. Return only JSON {"en": string, "ta": string, "punch": string}. en: 2 short simple English sentences describing the famous plot, iconic hero role/job, and memorable situations so a casual Tamil movie fan can guess it. ta: the same clue in natural simple Tamil script. punch: the hero\'s most famous punch dialogue from this exact movie, written in Tamil script followed by an English transliteration in brackets (max 20 words); if unsure, a short iconic line of the hero\'s character. NEVER include the movie title, any alternate title, or names of the actors or director.',
      input:
        "Movie data as json: " +
        JSON.stringify({
          title: r.title,
          year: r.year,
          genres: r.genres,
          hero: r.hero,
          heroine: r.heroine,
          director: r.director,
          plot: r.overview ?? r.story,
        }),
    }),
  });
  if (res.status === 429 || res.status === 402) throw new Error(`AI ${res.status}`);
  if (!res.ok) {
    console.error("clue AI", res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const j = (await res.json()) as {
    output_text?: string;
    output?: { type: string; content?: { type: string; text?: string }[] }[];
  };
  const text =
    j.output_text ??
    j.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ??
    "{}";
  try {
    const p = JSON.parse(text) as { en?: string; ta?: string; punch?: string };
    if (!p.en || !p.ta) return null;
    return { en: mask(p.en, r), ta: mask(p.ta, r), punch: p.punch ? mask(p.punch, r) : null };
  } catch {
    return null;
  }
}

export async function runClueRewrite(limit = 12) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI key missing");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("clue_rewrite_queue", { p_limit: limit });
  if (error) throw new Error(error.message);
  let done = 0;
  await Promise.all(
    (data as Row[]).map(async (r) => {
      const out = await rewrite(r, apiKey);
      if (!out) return;
      const { error: e } = await supabaseAdmin
        .from("movies")
        .update({ story_easy: out.en, story_ta: out.ta, punch_line: out.punch ?? "" })
        .eq("id", r.id);
      if (!e) done++;
      else console.error("clue save", e.message);
    }),
  );
  return { rewritten: done, remaining: (data as Row[]).length - done };
}
