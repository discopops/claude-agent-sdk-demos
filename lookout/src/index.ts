import { watchProfile } from "./profile/profile.ts";
import { runTick } from "./scheduler/scheduler.ts";

const TICK_SECONDS = Number(process.env.LOOKOUT_TICK_SECONDS ?? 60);
const once = process.argv.includes("--once");

function banner() {
  console.log("\x1b[1m\x1b[36mLookout\x1b[0m — a personal real-time intelligence analyst");
  console.log("\x1b[2mInterprets signal instead of piling up more of it. Kalshi is the reality-check.\x1b[0m");
  if (once) console.log("\x1b[2mmode: single tick (--once)\x1b[0m");
  else console.log(`\x1b[2mmode: continuous, every ${TICK_SECONDS}s (Ctrl-C to stop)\x1b[0m`);
}

async function main() {
  banner();

  let tick = 0;
  if (once) {
    await runTick(++tick);
    process.exit(0); // don't linger on any open handles
  }

  watchProfile();
  await runTick(++tick);

  const interval = setInterval(async () => {
    try {
      await runTick(++tick);
    } catch (err) {
      console.error("[tick] error:", (err as Error).message);
    }
  }, TICK_SECONDS * 1000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    console.log("\n\x1b[2mLookout stopped.\x1b[0m");
    process.exit(0);
  });
}

main();
