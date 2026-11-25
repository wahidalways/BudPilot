// When Shono connects, retries, lets go and reads: the rules use-earbuds.ts follows, here so a test catches a change.

export const READ_MS = 3000; // a full read of the earbuds, on screen
// in the background on Android: the earbuds announce their own changes, so the read is only a safety net, and a slower
// one saves both batteries
export const BG_READ_MS = 30_000;

/** The wait before the next full read. After one went unanswered it comes soon, also in the background: a link the
 * earbuds stopped answering on is then closed in seconds, not after 4 × 30 s with the screen saying Connected. */
export const readEvery = (background: boolean, misses: number) => (background && !misses ? BG_READ_MS : READ_MS);

/** Android: the wait before the next automatic try after `fails` failed ones in a row: 1.5, 3, 6, 12, then 20 s. Their
 * sound can stay on the phone for many minutes while their Bluetooth LE side is off (in the case, lid open), and a try
 * every 1.5 s kept the radio busy the whole time and warmed the phone (the user, 2026-11-25). */
export const retryWait = (fails: number) => Math.min(20_000, 1500 * 2 ** fails);

/** Whether a link made with Connect stays when the earbuds' sound goes to another device: only one made while their
 * sound was already elsewhere (to change a setting while they play on the PC). The first run's Connect counted too, so
 * closing the case left Shono's link up and the screen saying Connected (the user, 2026-11-25). */
export const holdsWhenSoundLeaves = (auto: boolean, soundHere: boolean | undefined) => !auto && soundHere === false;
