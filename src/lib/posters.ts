import { useEffect, useState } from "react";

const cache = new Map<string, string | null>();

async function fetchPoster(title: string): Promise<string | null> {
  if (cache.has(title)) return cache.get(title) ?? null;
  try {
    const slug = encodeURIComponent(title.replace(/ /g, "_"));
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}?redirect=true`,
    );
    const data = response.ok ? await response.json() : null;
    const poster = (data?.originalimage?.source ?? data?.thumbnail?.source ?? null) as
      string | null;
    cache.set(title, poster);
    return poster;
  } catch {
    cache.set(title, null);
    return null;
  }
}

export function useMoviePoster(title?: string) {
  const [url, setUrl] = useState<string | null>(title ? (cache.get(title) ?? null) : null);
  useEffect(() => {
    if (!title) return;
    let active = true;
    void fetchPoster(title).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [title]);
  return url;
}
