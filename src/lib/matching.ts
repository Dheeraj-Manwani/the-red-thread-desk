/** Lowercase, Unicode-normalise, drop punctuation and emoji, collapse spaces. Keeps Devanagari marks. */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s*]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesOne(tokens: string[], joined: string, raw: string): boolean {
  const keyword = normalize(raw);
  if (!keyword) return false;
  if (keyword.includes(" ")) return ` ${joined} `.includes(` ${keyword} `);
  if (keyword.endsWith("*")) {
    const prefix = keyword.slice(0, -1);
    return prefix.length > 0 && tokens.some((t) => t.startsWith(prefix));
  }
  return tokens.includes(keyword);
}

/**
 * Whole-word match against a keyword list. Phrases ("send link") match as phrases,
 * "kitn*" matches kitna/kitne/kitni. An empty list matches any text.
 */
export function matchesKeywords(text: string, keywords: string[]): boolean {
  const list = keywords.filter((k) => k.trim());
  if (list.length === 0) return true;
  const joined = normalize(text).replace(/\*/g, "");
  const tokens = joined.split(" ").filter(Boolean);
  return list.some((k) => matchesOne(tokens, joined, k));
}

export function containsAny(text: string, words: string[]): boolean {
  const list = words.filter((w) => w.trim());
  if (list.length === 0) return false;
  return matchesKeywords(text, list);
}

/** Splits a textarea into trimmed, non-empty lines. */
export function lines(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Like lines(), but commas also separate items. For keywords and IDs. */
export function list(value: FormDataEntryValue | null): string[] {
  return lines(value).flatMap((l) => l.split(",").map((p) => p.trim()).filter(Boolean));
}
