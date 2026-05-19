// src/screens/LineupModal.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Image } from 'react-native';
import { colors } from '../theme';

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  positions?: string[];
  /** As in Players.tsx, you store the chosen image here */
  photo_uri?: string | null; // local 'file://', 'content://', or a remote URL if you add later
};

type Props = {
  visible: boolean;
  onClose: () => void;
  positions: string[]; // ['GS','GA','WA','C','WD','GD','GK']
  players: Player[];
  value: Record<string, string | null>; // pos -> playerId
  onSave: (map: Record<string, string | null>) => void;
  title?: string;
};

/** Use the same field you render in Players.tsx */
function resolvePhotoUri(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  return raw; // works for file://, content://, and https://
}

/** “[photo]  Name” if photo exists; else just “Name” */
function NameWithOptionalPhoto({
  name,
  uri,
  size = 22,
}: { name: string; uri?: string; size?: number }) {
  if (!uri) return <Text style={styles.slotText} numberOfLines={1}>{name}</Text>;
  return (
    <View style={styles.namePhotoWrap}>
      {/* photo BEFORE the name (your request) */}
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: 4, backgroundColor: '#eee' }}
        resizeMode="cover"
      />
      <View style={{ width: 8 }} />
      <Text style={styles.slotText} numberOfLines={1}>{name}</Text>
    </View>
  );
}

/** Render a position pill like the report (“GS”, “GA”, …) */
function PositionPill({ pos }: { pos: string }) {
  return (
    <View style={styles.posPill}>
      <Text style={styles.posPillText}>{pos}</Text>
    </View>
  );
}

export default function LineupModal({
  visible, onClose, positions, players, value, onSave, title,
}: Props) {
  const [map, setMap] = useState<Record<string, string | null>>(value);
  useEffect(() => { setMap(value); }, [value]);

  const nameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of players) m[p.id] = `${p.first_name} ${p.last_name}`.trim();
    return m;
  }, [players]);

  const photoById = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const p of players) m[p.id] = resolvePhotoUri(p.photo_uri ?? null);
    return m;
  }, [players]);

  const [pickerFor, setPickerFor] = useState<string | null>(null);

  return (
    <Modal transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.h1}>{title || 'Set Lineup'}</Text>

          {/* Positions list (scrollable) */}
          <ScrollView style={{ maxHeight: 380 }}>
            {positions.map(pos => {
              const playerId = map[pos] || null;
              const name = playerId ? (nameById[playerId] || '—') : 'Select player';
              const photoUri = playerId ? photoById[playerId] : undefined;

              return (
                <View key={pos} style={styles.row}>
                  {/* Position pill on the left (looks like the report) */}
                  <View style={styles.posWrap}>
                    <PositionPill pos={pos} />
                  </View>

                  {/* Selectable slot with player info */}
                  <Pressable style={styles.slot} onPress={() => setPickerFor(pos)}>
                    <NameWithOptionalPhoto name={name} uri={photoUri} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.ghost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => onSave(map)}>
              <Text style={styles.btnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* picker drawer */}
      <Modal transparent visible={!!pickerFor} onRequestClose={() => setPickerFor(null)}>
        <View style={styles.overlay}>
          <View style={[styles.card, { maxWidth: 420 }]}>
            <Text style={styles.h1}>Pick player for {pickerFor}</Text>

            <ScrollView style={{ maxHeight: 420 }}>
              {/* Clear option */}
              <Pressable
                style={[styles.pickRow, { paddingVertical: 12 }]}
                onPress={() => {
                  if (pickerFor) { setMap({ ...map, [pickerFor]: null }); setPickerFor(null); }
                }}
              >
                <Text style={{ color: '#b00', fontWeight: '700' }}>Clear</Text>
              </Pressable>

              {players.map(p => {
                const fullName = `${p.first_name} ${p.last_name}`.trim();
                const photoUri = resolvePhotoUri(p.photo_uri ?? null);
                return (
                  <Pressable
                    key={p.id}
                    style={styles.pickRow}
                    onPress={() => {
                      if (pickerFor) { setMap({ ...map, [pickerFor]: p.id }); setPickerFor(null); }
                    }}
                  >
                    <NameWithOptionalPhoto name={fullName} uri={photoUri} />
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.ghost]} onPress={() => setPickerFor(null)}>
                <Text style={styles.btnGhostText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '92%', backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  h1: { fontSize: 18, fontWeight: '700', marginBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },

  // Position pill wrapper to align consistently
  posWrap: { width: 48, alignItems: 'center', justifyContent: 'center' },

  // Pill style (tuned to look like your report)
  posPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#60a5fa', // blue pill (adjust to match your report)
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posPillText: {
    color: '#0b1020',     // dark text on light blue (like your screenshot)
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },

  slot: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#fafafa'
  },

  // “[photo]  Name” row
  namePhotoWrap: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  slotText: { color: '#0f172a', flexShrink: 1, fontWeight: '700' },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  btn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#ccc' },
  btnGhostText: { color: '#333', fontWeight: '700' },

  pickRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
});