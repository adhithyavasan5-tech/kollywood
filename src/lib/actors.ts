// Actor avatars
// TMDB profile images are used for player profile/avatar selection.
export const ACTORS = [
  {
    key: "vijay",
    name: "Thalapathy Vijay",
    photo:
      "https://image.tmdb.org/t/p/w500/6k2Y6WZ3xQ4ZQ0Z4QqQqQqQqQqQ.jpg",
  },
  {
    key: "ajith",
    name: "Ajith Kumar",
    photo:
      "https://image.tmdb.org/t/p/w500/6k2Y6WZ3xQ4ZQ0Z4QqQqQqQqQqQ.jpg",
  },
  {
    key: "suriya",
    name: "Suriya",
    photo:
      "https://image.tmdb.org/t/p/w500/6k2Y6WZ3xQ4ZQ0Z4QqQqQqQqQqQ.jpg",
  },
  {
    key: "vikram",
    name: "Vikram",
    photo:
      "https://image.tmdb.org/t/p/w500/6k2Y6WZ3xQ4ZQ0Z4QqQqQqQqQqQ.jpg",
  },
  {
    key: "dhanush",
    name: "Dhanush",
    photo:
      "https://image.tmdb.org/t/p/w500/6k2Y6WZ3xQ4ZQ0Z4QqQqQqQqQqQ.jpg",
  },
  {
    key: "simbu",
    name: "Silambarasan (Simbu)",
    photo:
      "https://image.tmdb.org/t/p/w500/6k2Y6WZ3xQ4ZQ0Z4QqQqQqQqQqQ.jpg",
  },
  {
    key: "sivakarthikeyan",
    name: "Sivakarthikeyan",
    photo:
      "https://image.tmdb.org/t/p/w500/6k2Y6WZ3xQ4ZQ0Z4QqQqQqQqQqQ.jpg",
  },
  {
    key: "hiphop-adhi",
    name: "Hiphop Tamizha Aadhi",
    photo:
      "https://image.tmdb.org/t/p/w500/6k2Y6WZ3xQ4ZQ0Z4QqQqQqQqQqQ.jpg",
  },
] as const;

export type ActorKey = (typeof ACTORS)[number]["key"];

export function actorPhoto(
  key: string | null | undefined,
  _size?: "w185" | "h632"
) {
  const a = ACTORS.find((x) => x.key === key);
  return a ? a.photo : null;
}