// src/components/StatLibraryManager.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, Modal,
  Platform, Alert, ScrollView
} from 'react-native';
import { colors } from '../theme';
import {
  getStatLibrary, addCustomStat,
  updateCustomStat, removeCustomStat
} from '../storage/customStats';
import * as LabelStore from '../storage/statLabels';
import { StatId } from '../types/stats';

// Built-ins we want visible & editable
const VISIBLE_BUILTINS = new Set([
  "goal",
  "miss",
  "cp_to_score",
  "cp_no_score",
  "to_to_score",
]);

type LibraryItem = {
  id: StatId;
  label: string;
  scope?: 'player' | 'team';
};

const CRITICAL_IDS = new Set<StatId>(['goal', 'miss']);
const TEAM_FLOW_IDS = new Set<StatId>([
  'cp_to_score', 'cp_no_score', 'to_to_score'
]);

const hideKey = (id: StatId) => `__hide__:${String(id)}`;
const isCustomId = (id: StatId) => String(id).startsWith("custom:");

const safeGetLabelOverrides = async (): Promise<Record<string, string>> => {
  try {
    if (typeof (LabelStore as any).getLabelOverrides === 'function') {
      const res = await (LabelStore as any).getLabelOverrides();
      return res && typeof res === 'object' ? res : {};
    }
  } catch {}
  return {};
};

const safeSetLabelOverrides = async (next: Record<string, string>) => {
  try {
    if (typeof (LabelStore as any).setLabelOverrides === 'function') {
      await (LabelStore as any).setLabelOverrides(next);
    }
  } catch {}
};

export default function StatLibraryManager({ onLibraryChanged }) {
  const [tab, setTab] = useState<'player' | 'team'>('player');
  const [lib, setLib] = useState<LibraryItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<StatId | null>(null);
  const [tempLabel, setTempLabel] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<StatId | null>(null);

  // ⭐ CLEAN FIXED REFRESH FUNCTION
  const refresh = async () => {
    const items = await getStatLibrary(); // custom stats
    const ovs = await safeGetLabelOverrides();
    const o = ovs || {};

    // Built-in player stats (goal/miss)
    const builtinPlayerStats: LibraryItem[] = [
      { id: "goal", label: o["goal"] ?? "Goal", scope: "player" },
      { id: "miss", label: o["miss"] ?? "Miss", scope: "player" },
    ];

    // Built-in flow team stats
    const builtinTeamStats: LibraryItem[] = [
      { id: "cp_to_score", label: o["cp_to_score"] ?? "CP to Score", scope: "team" },
      { id: "cp_no_score", label: o["cp_no_score"] ?? "CP No Score", scope: "team" },
      { id: "to_to_score", label: o["to_to_score"] ?? "TO to Score", scope: "team" },
    ];

    // Custom stats with override applied
    const customStats: LibraryItem[] = items.map(it => ({
      ...it,
      label: o[it.id] ?? it.label,
      scope: it.scope ?? "player",
    }));

    // Combine everything
    const merged: LibraryItem[] = [
      ...builtinPlayerStats,
      ...builtinTeamStats,
      ...customStats,
    ];

    // Remove hidden stats
    const finalList = merged.filter(it => o[hideKey(it.id)] !== "1");

    setLib(finalList);
    setOverrides(o);
  };

  
useEffect(() => {
  (async () => {
    try {
      await refresh();
    } catch (e) {
      console.warn("StatLibraryManager init failed", e);
    }
  })();
}, []);


  const listForTab = useMemo(() => {
    return lib.filter(it => it.scope === tab);
  }, [lib, tab]);

  const openEdit = (id: StatId, curLabel: string) => {
    setEditingId(id);
    setTempLabel(curLabel ?? '');
    setModalOpen(true);
  };

const saveEdit = async () => {
  try {
    const labelText = tempLabel.trim();
    if (!labelText) {
      Alert.alert("Label required", "Please enter a name.");
      return;
    }

    if (!editingId) {
      // ✅ NEW STAT — create ONLY on Save
      await addCustomStat({
        label: labelText,
        scope: tab,
      });

    } else if (isCustomId(editingId)) {
      // ✅ EXISTING CUSTOM STAT
      await updateCustomStat(editingId, { label: labelText });

    } else {
      // ✅ BUILT‑IN STAT OVERRIDE
      const next = { ...(overrides || {}) };
      next[String(editingId)] = labelText;
      await safeSetLabelOverrides(next);
      setOverrides(next);
    }

    setModalOpen(false);
    setEditingId(null);
    await refresh();
    onLibraryChanged?.();

  } catch (e: any) {
    Alert.alert("Save failed", e?.message ?? "Could not save label.");
  }
};

   

  const requestDelete = (id: StatId) => {
    setPendingDeleteId(id);
    setConfirmOpen(true);
  };

  const performDelete = async () => {
    const id = pendingDeleteId;
    setConfirmOpen(false);
    if (!id) return;

    try {
      if (isCustomId(id)) {
        await removeCustomStat(id);
      } else {
        const next = { ...(overrides || {}) };
        next[hideKey(id)] = "1";
        await safeSetLabelOverrides(next);
        setOverrides(next);
      }

      await refresh();
      onLibraryChanged?.();
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message ?? "Could not delete.");
    } finally {
      setPendingDeleteId(null);
    }
  };

  // UI Rendering
  return (
    <View style={styles.wrap}>
      <Text style={styles.createTitle}>Create New Stat</Text>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab("player")}
          style={[styles.tab, tab === "player" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "player" && styles.tabTextOn]}>Player</Text>
        </Pressable>

        <Pressable
          onPress={() => setTab("team")}
          style={[styles.tab, tab === "team" && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === "team" && styles.tabTextOn]}>Team</Text>
        </Pressable>

        <Pressable
  onPress={() => {
    setEditingId(null);        // 👈 null = NEW stat
    setTempLabel("New Stat");  // default draft value
    setModalOpen(true);        // open editor ONLY
  }}
  style={styles.addBtn}
>
  <Text style={styles.addText}>Add</Text>
</Pressable>

      </View>

      <Text style={styles.sectionTitle}>
        {tab === "player" ? "Player Stats" : "Team Stats"}
      </Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 10 }}>
        {listForTab.map(it => (
          <View key={`${tab}-${it.id}`} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{it.label}</Text>
              <Text style={styles.rowHint}>({tab})</Text>
            </View>

            <View style={{ minWidth: 150, flexDirection: "row", gap: 8 }}>
              <Pressable
                style={styles.editBtn}
                onPress={() => openEdit(it.id, it.label)}
              >
                <Text style={styles.editText}>Edit</Text>
              </Pressable>

			    {!CRITICAL_IDS.has(it.id) && !TEAM_FLOW_IDS.has(it.id) ? (
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => requestDelete(it.id)}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              ) : (
                <View style={[styles.deleteBtn, { opacity: 0 }]} pointerEvents="none" />
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalOuter}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Stat Label</Text>
            <TextInput
              value={tempLabel}
              onChangeText={setTempLabel}
              autoFocus
              style={styles.modalInput}
            />

            <View style={styles.modalRow}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setModalOpen(false)}
              >
                <Text style={[styles.btnText, styles.btnTextDark]}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={saveEdit}
              >
                <Text style={styles.btnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete confirm */}
      <Modal visible={confirmOpen} animationType="fade" transparent>
        <View style={styles.modalOuter}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Delete</Text>
            <Text style={{ marginBottom: 10 }}>
              {pendingDeleteId
                ? CRITICAL_IDS.has(pendingDeleteId)
                  ? "You are deleting a critical built-in stat. Continue?"
                  : "Delete this stat?"
                : ""}
            </Text>

            <View style={styles.modalRow}>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setConfirmOpen(false)}
              >
                <Text style={[styles.btnText, styles.btnTextDark]}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.btn, styles.btnDanger]}
                onPress={performDelete}
              >
                <Text style={styles.btnText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const GAP = 8;

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  createTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },

  tabs: { flexDirection: 'row', alignItems: 'center', gap: GAP, marginBottom: 8 },
  tab: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 9999, backgroundColor: '#f8fafc',
    borderWidth: 1, borderColor: '#e2e8f0'
  },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontWeight: '900', color: '#0f172a' },
  tabTextOn: { color: '#fff' },

  addBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#22c55e'
  },
  addText: { color: '#fff', fontWeight: '900' },

  sectionTitle: {
    fontSize: 16, fontWeight: '800',
    color: '#0f172a', marginTop: 4, marginBottom: 8
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  rowTitle: { fontWeight: '800' },
  rowHint: { color: '#64748b' },

  editBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#cbd5e1'
  },
  editText: { fontWeight: '900', color: '#0f172a' },

  deleteBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, backgroundColor: '#ef4444'
  },
  deleteText: { fontWeight: '900', color: '#fff' },

  modalOuter: {
    flex: 1, justifyContent: 'center', padding: 16,
    backgroundColor: 'rgba(0,0,0,0.25)'
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e2e8f0'
  },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  modalInput: {
    borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10
  },

  modalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10, marginTop: 12
  },

  btn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: '#ef4444' },
  btnGhost: {
    backgroundColor: '#f8fafc',
    borderWidth: 1, borderColor: '#e2e8f0'
  },
  btnText: { color: '#fff', fontWeight: '900' },
  btnTextDark: { color: '#0f172a', fontWeight: '900' },
});