import { useEffect, useState } from "react";

// Name shown in clues -> Wikipedia article title (for portrait photos).
const WIKI: Record<string, string> = {
  Dharani: "Dharani (director)",
  Trisha: "Trisha Krishnan",
  Vijay: "Vijay (actor)",
  Shankar: "S. Shankar",
  "Aishwarya Rai": "Aishwarya Rai Bachchan",
  Vikram: "Vikram (actor)",
  Shalini: "Shalini (actress)",
  Saranya: "Saranya Ponvannan",
  Hari: "Hari (director)",
  Atlee: "Atlee (director)",
  Samantha: "Samantha Ruth Prabhu",
  "T.J. Gnanavel": "T. J. Gnanavel",
  "K.S. Ravikumar": "K. S. Ravikumar",
  "A.R. Murugadoss": "AR Murugadoss",
  Meena: "Meena (actress)",
  Arya: "Arya (actor)",
  Simran: "Simran (actress)",
  "Pushkar-Gayathri": "Pushkar–Gayathri",
  Sadha: "Sadha",
  Asin: "Asin",
};

const cache = new Map<string, string | null>();

async function fetchImage(name: string): Promise<string | null> {
  if (cache.has(name)) return cache.get(name)!;
  const title = encodeURIComponent((WIKI[name] ?? name).replace(/ /g, "_"));
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${title}?redirect=true`,
    );
    const json = res.ok ? await res.json() : null;
    const url: string | null = json?.thumbnail?.source ?? json?.originalimage?.source ?? null;
    cache.set(name, url);
    return url;
  } catch {
    cache.set(name, null);
    return null;
  }
}

export function usePersonImage(name?: string) {
  const [url, setUrl] = useState<string | null>(name ? (cache.get(name) ?? null) : null);
  useEffect(() => {
    if (!name) return;
    let alive = true;
    fetchImage(name).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [name]);
  return url;
}
