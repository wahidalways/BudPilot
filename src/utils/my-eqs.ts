/** The user's own EQ curves ("Movies", "Podcasts"). The earbuds have one programmable slot (Custom); their presets
 * play curves stored in the firmware. So saved EQs live on this computer, and playing one writes it into Custom. */
export type MyEq = { id: string; name: string; gains: number[] };

export const MAX_MY_EQS = 8;
export const MAX_NAME = 18;

export const sameCurve = (a: number[], b: number[]) => a.length === b.length && a.every((g, i) => g === b[i]);

/** The saved EQ the Custom slot is playing, judged from the earbuds' own report, so it stays right after a restart
 * or a change made elsewhere. `picked`: the one last picked or made wins when several hold this curve ("+ New"
 * copies the current one), else the first that matches. */
export const playingEq = (eqs: MyEq[], customOn: boolean, gains: number[], picked?: string) => {
  if (!customOn) return undefined;
  const match = eqs.filter((e) => sameCurve(e.gains, gains));
  return match.find((e) => e.id === picked) ?? match[0];
};

/** Why a name can't be used, or undefined when it can. `taken`: names already on screen (presets, Custom). */
export function nameProblem(name: string, eqs: MyEq[], taken: string[], exceptId?: string): string | undefined {
  const n = name.trim();
  if (!n) return "Give it a name";
  if (n.length > MAX_NAME) return `Keep it to ${MAX_NAME} characters`;
  const names = [...taken, ...eqs.filter((e) => e.id !== exceptId).map((e) => e.name)];
  if (names.some((t) => t.toLowerCase() === n.toLowerCase())) return `"${n}" is already used`;
  return undefined;
}
