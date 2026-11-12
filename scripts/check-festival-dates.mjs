// Warns (never fails) when a moon-based festival is about to run out of dates, so the buddy
// doesn't quietly skip a festival. Fixed-date festivals (New Year, Christmas…) never run out.
// The release workflow runs this on every merge; the warning shows on the run's summary.
// Usage: node scripts/check-festival-dates.mjs
/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node runs this plain JavaScript directly. */
import { fileURLToPath } from "node:url";
import { FESTIVALS } from "../website/dist/festivals.mjs";

/** Festivals whose last listed date is within `monthsAhead` months of `now`. */
export function datesRunningOut(now = new Date(), monthsAhead = 9, festivals = FESTIVALS) {
  const horizon = new Date(now.getFullYear(), now.getMonth() + monthsAhead, now.getDate());
  return festivals
    .filter((f) => f.dates?.length)
    .map((f) => ({ name: f.name, last: [...f.dates].sort().slice(-1)[0] }))
    .filter(({ last }) => new Date(`${last}T12:00:00`) < horizon);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const soon = datesRunningOut();
  for (const { name, last } of soon) {
    console.log(
      `::warning title=Festival dates running out::${name}'s last date is ${last}. Add the next years' dates to src/utils/seasons.ts and website/dist/festivals.mjs (a test keeps them in sync).`,
    );
  }
  if (!soon.length) console.log("Festival dates: every moon-based festival has dates for at least the next 9 months.");
}
