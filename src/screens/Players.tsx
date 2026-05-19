// src/screens/Players.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Image, Alert, RefreshControl,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { listPlayers, addPlayer, updatePlayer, deletePlayer } from '../storage/repository';
import PlayerEditModal from './PlayerEditModal';

type Player = {
  id: string; first_name: string; last_name: string;
  positions?: string[]; photo_uri?: string | null;
};

export default function Players() {
  const { theme } = useTheme();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [current, setCurrent] = useState<Partial<Player> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPlayers((await listPlayers() as any[]) || []); }
    catch (e: any) { Alert.alert('Load failed', e?.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onAdd = () => {
    setMode('create');
    setCurrent({ first_name: '', last_name: '', photo_uri: null, positions: [] });
    setEditOpen(true);
  };

  const onEdit = (p: Player) => {
    setMode('edit');
    setCurrent({ id: p.id, first_name: p.first_name, last_name: p.last_name, photo_uri: p.photo_uri ?? null, positions: p.positions ?? [] });
    setEditOpen(true);
  };

  const onDelete = (p: Player) => {
    Alert.alert(
      'Delete player',
      `Delete ${(`${p.first_name ?? ''} ${p.last_name ?? ''}`).trim() || 'this player'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deletePlayer(p.id, { hard: true }); await load(); }
          catch (e: any) { Alert.alert('Delete failed', e?.message); }
        }},
      ]
    );
  };

  const savePlayer = async (data: { id?: string; first_name: string; last_name: string; photo_uri: string | null; positions: string[] }) => {
    try {
      const notes = JSON.stringify({ photo_uri: data.photo_uri });
      if (mode === 'create') {
        await addPlayer({ first_name: data.first_name, last_name: data.last_name, positions: data.positions ?? [], notes });
      } else {
        await updatePlayer({ id: data.id!, first_name: data.first_name, last_name: data.last_name, positions: data.positions ?? [], notes });
      }
      await load();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message);
      throw e;
    }
  };

  const c = theme.colors;

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.head, { borderBottomColor: c.cardBorder }]}>
        <Text style={[s.h1, { color: c.text }]}>Players</Text>
        <Pressable style={[s.addBtn, { backgroundColor: c.primary }]} onPress={onAdd}>
          <Text style={s.addBtnText}>＋ Add</Text>
        </Pressable>
      </View>

      <FlatList
        data={players}
        keyExtractor={p => p.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={!loading ? <Text style={[s.empty, { color: c.muted }]}>No players yet. Tap "＋ Add".</Text> : null}
        renderItem={({ item: p }) => {
          const initials = (p.first_name || ' ').charAt(0).toUpperCase() + (p.last_name || ' ').charAt(0).toUpperCase();
          return (
            <View style={[s.row, { borderBottomColor: c.cardBorder, backgroundColor: c.card }]}>
              {p.photo_uri
                ? <Image source={{ uri: p.photo_uri }} style={s.avatar} />
                : <View style={[s.avatar, s.avatarFb, { backgroundColor: c.scoreBg }]}>
                    <Text style={[s.avatarText, { color: c.text }]}>{initials}</Text>
                  </View>}
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { color: c.text }]}>{`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || '—'}</Text>
                {!!p.positions?.length && <Text style={[s.meta, { color: c.muted }]}>{p.positions.join(', ')}</Text>}
              </View>
              <Pressable style={[s.btn, { backgroundColor: c.scoreBg, borderColor: c.cardBorder, borderWidth: 1 }]} onPress={() => onEdit(p)}>
                <Text style={[s.btnTxt, { color: c.text }]}>Edit</Text>
              </Pressable>
              <Pressable style={[s.btn, { backgroundColor: c.danger, marginLeft: 6 }]} onPress={() => onDelete(p)}>
                <Text style={s.btnTxt}>Delete</Text>
              </Pressable>
            </View>
          );
        }}
      />

      <PlayerEditModal
        visible={editOpen}
        mode={mode}
        initial={current ?? undefined}
        onSave={savePlayer}
        onClose={() => setEditOpen(false)}
      />
    </View>
  );
}

const AVATAR = 44;
const s = StyleSheet.create({
  container: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1 },
  h1: { fontSize: 22, fontWeight: '800' },
  addBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarFb: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900' },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { marginTop: 2 },
  btn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  btnTxt: { color: '#fff', fontWeight: '900' },
  empty: { textAlign: 'center', marginTop: 24 },
});
