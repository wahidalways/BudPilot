import { Text } from "react-native";

import { canDetectGames, type useGameMode } from "@/hooks/use-game-mode";
import type { Colors } from "@/theme";

import { Card, cardStyles, ToggleRow } from "./card";
import { LatencyCheck } from "./latency-check";

type Props = { c: Colors; game: ReturnType<typeof useGameMode> };


export function GameTab({ c, game }: Props) {
  const { prefs, update, active, byGame, setOn } = game;
  const status = byGame
    ? "On: a game or video is running full screen."
    : prefs.manual
      ? "On until you switch it off."
      : prefs.auto && canDetectGames()
        ? "Off. Turns on by itself when a game runs full screen."
        : "Off.";

  return (
    <>
      <Card c={c}>
        <ToggleRow c={c} title="Game mode" detail="Lowest audio delay, for games and videos" value={active} onChange={setOn} />
        <Text style={[cardStyles.hint, { color: active ? c.accent : c.muted }]}>{status}</Text>
        {canDetectGames() ? (
          <ToggleRow
            c={c}
            title="Auto-on for full-screen games"
            detail="On while a game or video runs full screen, off after"
            value={prefs.auto}
            onChange={(auto) => update({ auto })}
          />
        ) : (
          <Text style={[cardStyles.hint, { color: c.muted }]}>Turning on by itself for full-screen games needs BudPilot for Windows.</Text>
        )}
      </Card>

      <Card c={c} title="While gaming">
        <ToggleRow
          c={c}
          title="Footsteps EQ"
          detail="Less boom, clearer footsteps and reloads. Your own EQ comes back afterwards."
          value={prefs.eq}
          onChange={(eq) => update({ eq })}
        />
      </Card>

      <Card c={c} title="Latency check">
        <LatencyCheck c={c} gameOn={active} />
      </Card>
    </>
  );
}
