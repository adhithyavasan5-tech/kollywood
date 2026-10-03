// Actor avatars use official TMDB profile images (TMDB API terms, attributed in the app footer).
export const ACTORS = [
  {
    key: "vijay",
    name: "Thalapathy Vijay",
    photo:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSEUpZsvRQnX9NxB-IK_FDssfhkqSP03yOG0BBN_TUw-g&s=10",
  },
  {
    key: "ajith",
    name: "Ajith Kumar",
    photo:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_z4DMOdVnqCxHhmbip5qEikQLvWiSCW3QGRf4I6ilr3sdCLWsClkb_6ZK&s=10",
  },
  {
    key: "suriya",
    name: "Suriya",
    photo:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRKLIZN65FIiA35t3ZSH-hIDFnpKq7nsT265auH42dJtE_ZwQ3SkIiy63M&s=10",
  },
  {
    key: "vikram",
    name: "Vikram",
    photo:
      "https://static.toiimg.com/thumb/msid-112114037,width-1280,height-720,resizemode-4/112114037.jpg",
  },
  {
    key: "dhanush",
    name: "Dhanush",
    photo:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS8P85ZUr-zZVJJpDB-WGLBYgDcMXNFUrBiqKSwBlg3eJ0b-wWuHme9pB5D&s=10",
  },
  {
    key: "simbu",
    name: "Silambarasan (Simbu)",
    photo:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRI_EEexGASMAzKJuG_AOJYBLYkoYj8wY3KdAAh6HZ8zjHzqdSH2VgmjHk2&s=10",
  },
  {
    key: "sivakarthikeyan",
    name: "Sivakarthikeyan",
    photo: "https://cdn.gulte.com/wp-content/uploads/2024/10/Sivakarthikeyan-.jpeg",
  },
  {
    key: "hiphop-adhi",
    name: "Hiphop Tamizha Aadhi",
    photo:
      "https://cdn.starclinch.in/artist/hiphop-tamizha/hiphop-tamizha-1.jpg?width=3840&quality=100&format=webp&flop=false",
  },
] as const;

export type ActorKey = (typeof ACTORS)[number]["key"];

export function actorPhoto(key: string | null | undefined, _size?: "w185" | "h632") {
  const a = ACTORS.find((x) => x.key === key);
  return a ? a.photo : null;
}
