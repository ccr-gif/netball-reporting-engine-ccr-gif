// src/components/MatchStatPicker.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../theme';
import { getStatLibrary } from '../storage/customStats';
import * as LabelStore from '../storage/statLabels';
import { StatId } from '../types/stats';

// Only show these built-in stats in Match Setup
const VISIBLE_BUILTIN_PLAYER_STATS = ["goal", "miss"];

const VISIBLE_BUILTIN_TEAM_STATS: string[] = [
  "cp_to_score",
  "cp_no_score",
  "to_to_score",
  ];

type TeamFlowKey = 'cp_to_score' | 'cp_no_score' | 'to_to_score';

export type TrackingConfig = {
  player: string[];
  team: string[];
  teamFlowEnabled: Record<TeamFlowKey, boolean>;
  playerStyles?: Record<string, 'blue' | 'red'>;
};

type LibraryItem = {
  id: StatId;
  label: string;
  scope: 'player' | 'team' | 'both';
};

const TEAM_FLOW_KEYS: TeamFlowKey[] = [
  'cp_to_score',
  'cp_no_score',
  'to_to_score',
];

const safeGetLabelOverrides = async () => {
  try {
    const res = await LabelStore.getLabelOverrides?.();
    return res ?? {};
  } catch {
    return {};
  }
};

export default function MatchStatPicker({ value, onChange, refreshKey }) {
  const [lib, setLib] = useState<LibraryItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

 // Load stat library and overrides
useEffect(() => {
  (async () => {
    const baseItems = await getStatLibrary();
    const ovs = await safeGetLabelOverrides();

    // ✅ Custom stats ONLY (DB is now clean)
    const customStats = baseItems
      .filter((item) => {
        const id = String(item.id).trim().toLowerCase();
        return ![
          "goal",
          "miss",
          "assist",
          "feed",
          "rebound_off",
          "rebound_def",
          "cpr",
          "penalty",
          "bad_pass",
          "interception",
          "to_won",
          "to_lost",
          "cp_to_score",
          "cp_no_score",
          "to_to_score"
        ].includes(id);
      })
      .map((item) => ({
        ...item,
        scope: item.scope ?? "player",
        label: ovs[item.id] ?? item.label,
      }));

    // ✅ Canonical built‑in PLAYER stats (with overrides)
    const builtinPlayers = [
  { id: "goal", label: "Goal", scope: "player" },
  { id: "miss", label: "Miss", scope: "player" },
];

const builtinTeams = [
  { id: "cp_to_score", label: "CP to Score", scope: "team" },
  { id: "cp_no_score", label: "CP No Score", scope: "team" },
  { id: "to_to_score", label: "TO to Score", scope: "team" },
];
``

    // ✅ FINAL library = built‑ins + custom stats
    const finalLib = [
      ...builtinPlayers,
      ...builtinTeams,
      ...customStats,
    ];

    setLib(finalLib);
    setOverrides(ovs);

  })();
}, [refreshKey]);



  const playerSelected = useMemo(() => new Set(value.player.map(String)), [value.player]);
  const teamSelected = useMemo(() => new Set(value.team.map(String)), [value.team]);

  const teamFlow = value.teamFlowEnabled;
  const playerStyles = value.playerStyles ?? {};

  //const playerList = useMemo(
    //() => lib.filter((x) => x.scope === 'player' || x.scope === 'both'),
    //[lib]
  //);
  
  const playerList = useMemo(() => {
  return lib.filter((x) => x.scope === "player");
}, [lib]);
  
  //const playerList = useMemo(() => {
  //return lib.filter((x) => {
    // Keep custom stats
    //if (String(x.id).startsWith("custom:")) return true;

    // Keep ONLY goal + miss from built-ins
    //return VISIBLE_BUILTIN_PLAYER_STATS.includes(String(x.id));
  //});
//}, [lib]);

  //const teamList = useMemo(
   // () => lib.filter((x) => x.scope === 'team' || x.scope === 'both'),
   // [lib]
  //);
  
  const teamList = useMemo(() => {
  return lib.filter((x) => x.scope === "team");
}, [lib]);
  
 // const teamList = useMemo(() => {
  //return lib.filter((x) => {
    // Keep custom stats
    //if (String(x.id).startsWith("custom:")) return true;

    // Keep team flows
   // if (TEAM_FLOW_KEYS.includes(x.id as TeamFlowKey)) return true;

    // Otherwise hide built-in team stats
   // return VISIBLE_BUILTIN_TEAM_STATS.includes(String(x.id));
  //});
//}, [lib]);

  // Correct publishing (fixes MatchCenter missing stats)
  const publish = (next) => {
    const canonical = {
      ...next,

      // Ensure unique IDs
      player: [...new Set(next.player.map(String))],
      team: [...new Set(next.team.map(String))],

      // Correct key name
      teamFlowEnabled: {
        cp_to_score: !!next.teamFlowEnabled?.cp_to_score,
        cp_no_score: !!next.teamFlowEnabled?.cp_no_score,
        to_to_score: !!next.teamFlowEnabled?.to_to_score,
      },

      playerStyles: next.playerStyles ?? {},
    };

    onChange(canonical);
  };

  const togglePlayer = (id: string) => {
    const next = new Set(playerSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    publish({ ...value, player: [...next] });
  };

  const toggleTeam = (id: string) => {
    const next = new Set(teamSelected);
    next.has(id) ? next.delete(id) : next.add(id);
    publish({ ...value, team: [...next] });
  };

  const toggleFlow = (key: TeamFlowKey) => {
    publish({
      ...value,
      teamFlowEnabled: { ...teamFlow, [key]: !teamFlow[key] },
    });
  };

  const setPlayerStyle = (id: string, style: 'blue' | 'red') => {
    const updated = { ...playerStyles };

    if (updated[id] === style) {
      delete updated[id];
    } else {
      updated[id] = style;
    }

    publish({ ...value, playerStyles: updated });
  };

  //const friendly = (id: string, fallback: string) => {
   // if (!id.startsWith('custom:')) return fallback;
   // return overrides[id] || fallback || 'Custom';
  //};
  
const friendly = (id: string, fallback: string) => {
  // Built-in & custom overrides ALWAYS win
  if (overrides[id]) return overrides[id];

  // Otherwise use resolved label
  return fallback;
};
``

  const Row = ({ checked, label, onToggle, right }) => (
    <View style={s.row}>
      <Pressable style={s.left} onPress={onToggle}>
        <View style={[s.box, checked && s.boxOn]}>
          {checked && <Text style={s.tick}>✓</Text>}
        </View>
        <Text style={s.label}>{label}</Text>
      </Pressable>

      {right ? <View style={s.right}>{right}</View> : null}
    </View>
  );

  return (
    <View style={s.wrap}>
      <Text style={s.heading}>Player Stats</Text>

      <View style={s.list}>
        {playerList.map((it) => {
          const id = String(it.id);

          return (
            
<Row
  key={id}
  checked={playerSelected.has(id)}
  label={friendly(id, it.label)}
  
  onToggle={() => togglePlayer(id)}

              onToggle={() => togglePlayer(id)}
              right={
                <View style={s.styleWrap}>
                  {/* BLUE */}
                  <Pressable
                    style={[
                      s.styleBtn,
                      s.blue,
                      playerStyles[id] === 'blue' && s.styleBtnSelected,
                    ]}
                    onPress={() => setPlayerStyle(id, 'blue')}
                  >
                    <Text style={s.styleText}>Blue</Text>
                    {playerStyles[id] === 'blue' && (
                      <Text style={s.styleCheck}>✓</Text>
                    )}
                  </Pressable>

                  {/* RED */}
                  <Pressable
                    style={[
                      s.styleBtn,
                      s.red,
                      playerStyles[id] === 'red' && s.styleBtnSelected,
                    ]}
                    onPress={() => setPlayerStyle(id, 'red')}
                  >
                    <Text style={s.styleText}>Red</Text>
                    {playerStyles[id] === 'red' && (
                      <Text style={s.styleCheck}>✓</Text>
                    )}
                  </Pressable>
                </View>
              }
            />
          );
        })}
      </View>

<Text style={[s.heading, { marginTop: 16 }]}>Team Stats</Text>

<View style={s.list}>
  {teamList.map((it) => {
    const id = String(it.id);

// TEAM FLOW — NOW WITH RED / BLUE BUTTONS
if (TEAM_FLOW_KEYS.includes(id as TeamFlowKey)) {
  return (
    <Row
      key={id}
      checked={teamFlow[id]}
      label={friendly(id, it.label)}
      onToggle={() => toggleFlow(id as TeamFlowKey)}
      right={
        <View style={s.styleWrap}>

          {/* BLUE */}
          <Pressable
            style={[
              s.styleBtn,
              s.teamBlue,
              playerStyles[id] === "blue" && s.styleBtnSelected,
            ]}
            onPress={() => setPlayerStyle(id, "blue")}
          >
            <Text style={s.styleText}>Blue</Text>
            {playerStyles[id] === "blue" && (
              <Text style={s.styleCheck}>✓</Text>
            )}
          </Pressable>

          {/* RED */}
          <Pressable
            style={[
              s.styleBtn,
              s.red,
              playerStyles[id] === "red" && s.styleBtnSelected,
            ]}
            onPress={() => setPlayerStyle(id, "red")}
          >
            <Text style={s.styleText}>Red</Text>
            {playerStyles[id] === "red" && (
              <Text style={s.styleCheck}>✓</Text>
            )}
          </Pressable>

        </View>
      }
    />
  );
}

    // TEAM CUSTOM / TEAM BUILT-IN — ADD RED/BLUE BUTTONS
    return (
      <Row
        key={id}
        checked={teamSelected.has(id)}
        //label={friendly(id, it.label)}
		label={friendly(id, it.label)}
        onToggle={() => toggleTeam(id)}
        right={
          <View style={s.styleWrap}>
            {/* BLUE */}
            <Pressable
              style={[
                s.styleBtn,
                s.teamBlue,
                playerStyles[id] === "blue" && s.styleBtnSelected,
              ]}
              onPress={() => setPlayerStyle(id, "blue")}
            >
              <Text style={s.styleText}>Blue</Text>
              {playerStyles[id] === "blue" && (
                <Text style={s.styleCheck}>✓</Text>
              )}
            </Pressable>

            {/* RED */}
            <Pressable
              style={[
                s.styleBtn,
                s.red,
                playerStyles[id] === "red" && s.styleBtnSelected,
              ]}
              onPress={() => setPlayerStyle(id, "red")}
            >
              <Text style={s.styleText}>Red</Text>
              {playerStyles[id] === "red" && (
                <Text style={s.styleCheck}>✓</Text>
              )}
            </Pressable>
          </View>
	  }
	/>
    );
  })}
</View>

</View>
);
}


const s = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
  },

  heading: { fontSize: 16, fontWeight: '800', marginBottom: 8 },

  list: { borderTopWidth: 1, borderTopColor: '#e2e8f0' },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },

  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  box: {
    width: 30,
    height: 30,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },

  tick: { color: '#fff', fontSize: 18, fontWeight: '900' },

  label: { fontWeight: '700', color: '#0f172a' },

  right: { flexDirection: 'row', gap: 10, alignItems: 'center' },

  styleWrap: { flexDirection: 'row', gap: 8 },

  styleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 0,
    borderRadius: 14,
  },

  styleBtnSelected: {
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  blue: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  teamBlue: { backgroundColor: '#082D80', borderColor: '#082D80', },
  red: { backgroundColor: '#BA3856', borderColor: '##BA3856' },

  styleText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  styleCheck: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
