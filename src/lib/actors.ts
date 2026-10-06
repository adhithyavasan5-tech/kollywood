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
    photo:
      "https://cdn.gulte.com/wp-content/uploads/2024/10/Sivakarthikeyan-.jpeg",
  },
  {
    key: "hiphop-adhi",
    name: "Hiphop Tamizha Aadhi",
    photo:
      "https://cdn.starclinch.in/artist/hiphop-tamizha/hiphop-tamizha-1.jpg?width=3840&quality=100&format=webp&flop=false",
  },
    {
    key: "rajinikanth",
    name: "Rajinikanth",
    photo: "https://i.pinimg.com/736x/a8/95/33/a895332f1477afe2270c4f6d072b5000.jpg",
  },
  {
    key: "kamal-haasan",
    name: "Kamal Haasan",
    photo: "https://preview.redd.it/why-was-kamal-hassan-never-able-to-succeed-in-bollywood-v0-h1ogfu1tb24f1.jpeg?auto=webp&s=38a3e6f5f75c1d1dd7006c1948089ef1268fd673",
  },
  {
    key: "karthi",
    name: "Karthi",
    photo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTorgqw7itAI2XZFEBHK5J399ogye5ynsHi7lLzd1LwY8FiHYcitTp_5tZ-&s=10",
  },
  {
    key: "jayam-ravi",
    name: "Jayam Ravi",
    photo: "https://i.pinimg.com/736x/e5/3a/6e/e53a6e71aac9ed6a45a722fc7d1f29a6.jpg",
  },
] as const;

export type ActorKey = (typeof ACTORS)[number]["key"];

export function actorPhoto(
  key: string | null | undefined,
  size: "w185" | "h632" = "w185",
) {
  const a = ACTORS.find((x) => x.key === key);
  return a ? a.photo : null;
}
