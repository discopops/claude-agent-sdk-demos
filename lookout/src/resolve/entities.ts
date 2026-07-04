import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getProfile } from "../profile/profile.ts";

const ALIASES_PATH = resolve(import.meta.dir, "../../config/aliases.json");

// The alias map is rebuilt from disk + profile only when invalidated (on profile
// hot-reload). resolveEntityKeys runs per signal per tick, so we must not re-read
// and re-parse aliases.json every call.
let aliasCache: Map<string, string> | null = null;

/** Drop the memoized alias map; call when the profile changes (it feeds the map). */
export function invalidateAliasCache() {
  aliasCache = null;
}

/** alias (lowercased phrase) -> canonical slug. Built from aliases.json + profile entities. */
function buildAliasMap(): Map<string, string> {
  if (aliasCache) return aliasCache;
  const map = new Map<string, string>();
  try {
    const raw = JSON.parse(readFileSync(ALIASES_PATH, "utf8")) as Record<string, string>;
    for (const [alias, slug] of Object.entries(raw)) {
      if (alias.startsWith("$")) continue;
      map.set(alias.toLowerCase(), slug);
    }
  } catch {
    /* aliases file optional */
  }
  for (const e of getProfile().entities) {
    map.set(e.key.replace(/-/g, " ").toLowerCase(), e.key);
    for (const a of e.aliases) map.set(a.toLowerCase(), e.key);
  }
  aliasCache = map;
  return map;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Lightweight L2 resolution: find canonical entity slugs mentioned in free
 * text via the alias map (word-boundary match). Returns [] when nothing known
 * matches — callers may then fall back to a derived slug.
 */
export function resolveEntityKeys(text: string): string[] {
  const hay = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  for (const [alias, slug] of buildAliasMap()) {
    const needle = alias.includes(" ") ? alias : ` ${alias} `;
    if (alias.includes(" ") ? hay.includes(alias) : hay.includes(needle)) {
      found.add(slug);
    }
  }
  return [...found];
}
