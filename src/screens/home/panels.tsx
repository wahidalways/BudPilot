// The settings window's pages (Touch controls has its own file).
import { Pressable, StyleSheet, View } from "react-native";

import { HOCO_EQ35 as P } from "@/devices/hoco-eq35";
import { canDetectGames } from "@/hooks/use-game-mode";
import { ACCENTS, hsl, useColors, useTheme } from "@/theme";
import { Button, Card, Seg, TextBox, ToggleRow, Txt } from "@/ui/kit";
import { seconds } from "@/utils/corrections";
import { GAME_EQ, GAME_EQ_NAME } from "@/utils/game";
import { MAX_NAME } from "@/utils/my-eqs";

import appConfig from "../../../app.json"; // the version the builds use (expo-constants reported a stale one on web)

import { EqCurve } from "./eq-curve";
import { LatencyCheck } from "./latency-check";
import { Credit, EqPills, GameEqPicker, GameRow, NoiseControl } from "./parts";
import { type BudPilot, modeName } from "./use-bud-pilot";
import { useEqEditor } from "./use-eq-editor";

export function PanelHead({ title, lead }: { title: string; lead?: string }) {
  return (
    <View style={s.head}>
      <Txt v="h1" accessibilityRole="header">
        {title}
      </Txt>
      {lead ? (
        <Txt v="body" muted>
          {lead}
        </Txt>
      ) : null}
    </View>
  );
}

const when = (at: number) => {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
};


export function SoundPanel({ b }: { b: BudPilot }) {
  const c = useColors();
  const log = b.corrections.slice(0, 5);
  return (
    <>
      <PanelHead title="Sound" />
      <Card>
        <Txt v="title">Noise control</Txt>
        <NoiseControl b={b} big />
      </Card>
      <Card>
        <ToggleRow
          testID="keep"
          title="Keep my noise setting"
          detail="Undoes the earbuds' own switches. Press and hold still works."
          value={b.keep}
          onChange={b.setKeep}
        />
        {log.length ? (
          <View style={[s.log, { borderTopColor: c.hair }]} accessibilityLabel="Recent put-backs">
            {log.map((e) => (
              <View key={e.at} style={[s.logRow, { borderBottomColor: c.hair }]}>
                <Txt v="small" muted style={s.logTime}>
                  {when(e.at)}
                </Txt>
                <Txt v="small" style={s.grow}>
                  {e.from === e.to ? `${modeName(e.to)} strength put back` : `${modeName(e.from)} → ${modeName(e.to)}`}
                </Txt>
                <Txt v="small" style={[s.num, { color: c.ok }]}>
                  {seconds(e.ms)}
                </Txt>
              </View>
            ))}
          </View>
        ) : (
          <Txt v="sub">Nothing to undo yet</Txt>
        )}
      </Card>
      {b.state?.wearDetection !== undefined && (
        <Card>
          <ToggleRow
            title="Wear detection"
            detail="Senses when they're in your ears"
            value={b.state.wearDetection}
            onChange={(on) => void b.run((e) => e.setWearDetection(on))()}
          />
        </Card>
      )}
    </>
  );
}

/** The EQ: pills to pick one, the curve, and the user's own saved EQs: "+ New" makes one from the current sound
 * (flat when a preset plays) and selects it; dragging a saved EQ's curve saves into it. */
export function EqualizerPanel({ b }: { b: BudPilot }) {
  const c = useColors();
  const my = b.myEqs;
  const { gains, setDraft, commit, naming, setNaming, confirmName, startNew, kind, playing, faded, isFlat, resetToFlat } = useEqEditor(b);

  // the built-in Game EQ borrows the Custom slot: show it as itself, and keep the user's Custom out of the way
  if (kind === "game")
    return (
      <>
        <PanelHead title="Equalizer" />
        <EqPills b={b} />
        <Card>
          <EqCurve bands={P.eqBands} gains={GAME_EQ} max={P.eqMax} faded={false} readOnly onChange={() => {}} onCommit={() => {}} />
          <View style={s.row}>
            <Txt v="sub" style={s.grow}>
              {GAME_EQ_NAME} plays while Game mode is on. Your EQ comes back after.
            </Txt>
            <Button label={`Turn off ${GAME_EQ_NAME}`} onPress={() => b.game.setEqOn(false)} />
          </View>
        </Card>
      </>
    );

  const [status, actions] =
    kind === "preset"
      ? ["Preset playing. Drag a point to make your own.", null]
      : playing
        ? [
            `${playing.name} is playing. Drag the curve to change it.`,
            <>
              <Button label="Rename" onPress={() => setNaming({ id: playing.id, name: playing.name })} />
              <Button label="Delete" onPress={() => my.remove(playing.id)} />
            </>,
          ]
        : [
            my.list.length ? "A curve that isn't saved yet" : "Your own curve, kept on the earbuds",
            <>
              <Button primary label="Save as…" onPress={() => setNaming({ name: "" })} />
              {!isFlat && <Button label="Reset to flat" onPress={resetToFlat} />}
            </>,
          ];

  return (
    <>
      <PanelHead title="Equalizer" lead="Make your own EQs with + New and pick them like presets, here and in the tray." />
      <EqPills b={b} onNew={startNew} />
      <Card>
        <EqCurve bands={P.eqBands} gains={gains} max={P.eqMax} faded={faded} onChange={setDraft} onCommit={commit} />
        {naming ? (
          <View style={s.row}>
            <TextBox
              label={naming.id ? "New name" : "Name for the new EQ"}
              placeholder="Name it, e.g. Movies"
              value={naming.name}
              maxLength={MAX_NAME}
              onChange={(name) => setNaming({ ...naming, name, problem: undefined })}
              onSubmit={confirmName}
              onCancel={() => setNaming(undefined)}
            />
            <Button primary label={naming.id ? "Rename" : "Save"} onPress={confirmName} />
            <Button label="Cancel" onPress={() => setNaming(undefined)} />
          </View>
        ) : (
          <View style={s.row}>
            <Txt v="sub" style={s.grow}>
              {status}
            </Txt>
            {actions}
          </View>
        )}
        {naming?.problem && (
          <Txt v="sub" style={{ color: c.danger }}>
            {naming.problem}
          </Txt>
        )}
      </Card>
    </>
  );
}

export function GamePanel({ b }: { b: BudPilot }) {
  const { prefs, update, active } = b.game;
  return (
    <>
      <PanelHead title="Game" />
      <Card>
        <GameRow b={b} />
        {canDetectGames() ? (
          <ToggleRow
            title="Auto-on for full-screen games"
            detail="While a game or video is full screen"
            value={prefs.auto}
            onChange={(auto) => update({ auto })}
          />
        ) : (
          <Txt v="sub">Turning on by itself for full-screen games needs Shono for Windows.</Txt>
        )}
      </Card>
      <Card>
        <ToggleRow
          testID="game-eq-on"
          title="EQ while gaming"
          detail="Plays while Game mode is on (also the chip beside the switch in the tray); your own EQ comes back after."
          value={b.game.prefs.eqOn}
          onChange={b.game.setEqOn}
        />
        <GameEqPicker b={b} />
      </Card>
      <Card>
        <Txt v="title">Latency check</Txt>
        <LatencyCheck gameOn={active} />
      </Card>
    </>
  );
}

const THEMES = [
  { value: "system" as const, label: "System" },
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
];

function Swatches() {
  const { c, look, setLook } = useTheme();
  return (
    <View style={s.swatches} accessibilityRole="radiogroup" aria-label="Accent colour">
      {ACCENTS.map((a) => {
        const on = look.accent === a.key;
        return (
          <Pressable
            key={a.key}
            testID={`accent-${a.key}`}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityLabel={a.name}
            onPress={() => setLook({ accent: a.key })}
            style={[
              s.swatch,
              {
                backgroundColor: hsl(a.h, a.s, 47),
                boxShadow: `inset 0 1px 1px rgba(255, 255, 255, 0.55), inset 0 -2px 4px rgba(0, 0, 0, 0.15)${on ? `, 0 0 0 2px ${c.surface}, 0 0 0 4px ${c.ink}` : `, 0 0 0 1px ${c.hair}`}`,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export function AppPanel({ b }: { b: BudPilot }) {
  const { look, setLook } = useTheme();
  const { startup, notice } = b;
  const connected = b.status === "connected" && !!b.state;
  return (
    <>
      <PanelHead title="App" />
      <Card>
        <Txt v="title">Appearance</Txt>
        <View style={s.row}>
          <Txt style={s.grow}>Theme</Txt>
          <Seg fit label="Theme" testIDPrefix="theme" options={THEMES} value={look.theme} onChange={(theme) => setLook({ theme })} />
        </View>
        <View style={s.row}>
          <Txt style={s.grow}>Accent colour</Txt>
          <Swatches />
        </View>
      </Card>
      {(startup.available || notice.available) && (
        <Card>
          {startup.available &&
            (startup.on === null ? (
              <Txt v="sub">Start with Windows works in the Shono app (the .exe), not in this live test window.</Txt>
            ) : (
              <ToggleRow
                title="Start with Windows"
                detail="Starts quietly in the tray"
                value={!!startup.on}
                onChange={(on) => void startup.set(on)}
              />
            ))}
          {notice.available && (
            <ToggleRow
              title="Tell me when Shono steps in"
              detail="When it puts your noise setting back"
              value={notice.on}
              onChange={notice.setOn}
            />
          )}
        </Card>
      )}
      <Card>
        <View style={s.row}>
          <View style={s.grow}>
            <Txt v="title">Earbuds</Txt>
            <Txt v="sub">{connected ? `Connected to ${b.state!.name}` : b.status === "reconnecting" ? "Waiting for your earbuds" : "Not connected"}</Txt>
          </View>
          {connected || b.status === "reconnecting" ? (
            <Button label="Disconnect" onPress={() => void b.disconnect()} />
          ) : (
            <Button primary label={b.status === "connecting" ? "Connecting…" : "Connect"} onPress={b.status === "idle" ? () => void b.connect() : undefined} />
          )}
        </View>
      </Card>
      <Card>
        <View>
          <Txt v="title">Shono {appConfig.expo.version}</Txt>
          <Txt v="sub">Works with HOCO EQ35 ANC</Txt>
        </View>
        <Credit />
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  head: { gap: 4, marginBottom: 2 },
  grow: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  log: { borderTopWidth: 1 },
  logRow: { flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  logTime: { minWidth: 70, fontVariant: ["tabular-nums"] },
  num: { fontVariant: ["tabular-nums"] },
  swatches: { flexDirection: "row", gap: 10 },
  swatch: { width: 26, height: 26, borderRadius: 13 },
});
