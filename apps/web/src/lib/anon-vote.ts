const KEY = "oh_anon_id";
const VOTES_KEY = "oh_anon_votes";

export function getAnonToken(): string {
  if (typeof localStorage === "undefined") return "";
  let token = localStorage.getItem(KEY);
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(KEY, token);
  }
  return token;
}

export function getAnonVotes(): Set<number> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(VOTES_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function setAnonVoted(postId: number, voted: boolean) {
  const votes = getAnonVotes();
  if (voted) votes.add(postId);
  else votes.delete(postId);
  localStorage.setItem(VOTES_KEY, JSON.stringify([...votes]));
}
