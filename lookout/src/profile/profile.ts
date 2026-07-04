import { readFileSync, watch } from "node:fs";
import { resolve } from "node:path";

const PROFILE_PATH = resolve(import.meta.dir, "../../config/profile.json");

export interface Profile {
  interests: { topic: string; weight: number }[];
  regions: { name: string; geo?: { country?: string }; weight: number }[];
  entities: { key: string; aliases: string[]; weight: number }[];
  standingQuestions: { id: string; text: string; entities: string[]; active: boolean }[];
  thresholds: {
    interrupt: number;
    digest: number;
    silent: number;
    relevanceMin: number;
    cooldownMins: number;
    maxInterruptsPerHour: number;
    quietHours: [number, number];
  };
  weights: {
    velocity: number;
    convergence: number;
    conviction: number;
    relevanceGamma: number;
    noveltyTauMins: number;
  };
  feedbackBias: Record<string, number>;
}

let current: Profile = load();

function load(): Profile {
  const raw = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
  delete raw.$comment;
  return raw as Profile;
}

export function getProfile(): Profile {
  return current;
}

/** Start watching the profile file so edits take effect live (the lens is editable). */
export function watchProfile(onChange?: (p: Profile) => void) {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  watch(PROFILE_PATH, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        current = load();
        console.log("[profile] reloaded config/profile.json");
        onChange?.(current);
      } catch (err) {
        console.error("[profile] reload failed (keeping previous):", (err as Error).message);
      }
    }, 150);
  });
}
