export const PLAYER_ID_RE = /^[a-z0-9_]{3,20}$/;

export function normalizePlayerId(id: string) {
  return id.trim().toLowerCase();
}

export function playerEmail(id: string) {
  return `${normalizePlayerId(id)}@players.kollywoodclash.app`;
}

export function passwordProblem(pw: string): string | null {
  if (!pw) return "Please enter your password.";
  if (pw.length < 6) return "Password needs at least 6 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Use at least one letter and one number.";
  return null;
}

export function errMsg(e: unknown) {
  const m = (e as { message?: string })?.message;
  return m && m.length < 120 ? m : "Something went wrong. Please try again.";
}
