// src/screens/PlayerEditModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Image,
  Alert,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
// Use the legacy shim to keep copyAsync without SDK 54 warning
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '../theme';

const POSITIONS_ALL = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'] as const;

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  initial?: {
    id?: string;
    first_name?: string;
    last_name?: string;
    photo_uri?: string | null;
    positions?: string[];
  };
  onSave: (data: {
    id?: string;
    first_name: string;
    last_name: string;
    photo_uri: string | null;
    positions: string[]; // optional (can be empty)
  }) => Promise<void>;
  onClose: () => void;
};

export default function PlayerEditModal({
  visible,
  mode,
  initial,
  onSave,
  onClose,
}: Props) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(
    initial?.photo_uri ?? null
  );

  // Default positions logic:
  // - Create: preselect all positions
  // - Edit: if player has saved positions, use them; otherwise preselect all
  const computedDefaultPositions = useMemo<string[]>(
    () => {
      if (mode === 'edit') {
        const existing = initial?.positions ?? [];
        return existing.length > 0 ? existing.slice() : [...POSITIONS_ALL];
      }
      return [...POSITIONS_ALL];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, initial?.id]
  );
  const [positions, setPositions] = useState<string[]>(computedDefaultPositions);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setFirstName(initial?.first_name ?? '');
      setLastName(initial?.last_name ?? '');
      setPhotoUri(initial?.photo_uri ?? null);

      const def =
        mode === 'edit'
          ? (initial?.positions?.length ?? 0) > 0
            ? (initial?.positions as string[])
            : [...POSITIONS_ALL]
          : [...POSITIONS_ALL];
      setPositions(def);
    }
  }, [
    visible,
    mode,
    initial?.first_name,
    initial?.last_name,
    initial?.photo_uri,
    initial?.positions,
  ]);

  const togglePos = (p: string) => {
    setPositions(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const choosePhoto = async () => {
    try {
      if (Platform.OS === 'ios') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert(
            'Permission needed',
            'Please allow Photo Library access to select a picture.'
          );
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      const filename = `player_${Date.now()}.jpg`;
      const dest = FileSystem.documentDirectory! + filename;
      await FileSystem.copyAsync({ from: asset.uri, to: dest });
      setPhotoUri(dest);
    } catch (e: any) {
      Alert.alert('Photo error', e?.message ?? 'Could not select the photo.');
    }
  };

  const removePhoto = () => setPhotoUri(null);

  const doSave = async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first && !last) {
      Alert.alert('Missing name', 'Enter at least a first or last name.');
      return;
    }
    try {
      setBusy(true);
      await onSave({
        id: initial?.id,
        first_name: first,
        last_name: last,
        photo_uri: photoUri ?? null,
        positions, // can be an empty array (not mandatory)
      });
      onClose();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not save the player.');
    } finally {
      setBusy(false);
    }
  };

  const initials =
    (firstName || ' ').charAt(0).toUpperCase() +
    (lastName || ' ').charAt(0).toUpperCase();

  return (
    
<Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
  
  <KeyboardAvoidingView
    style={{ flex: 1 }}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    keyboardVerticalOffset={90}
  >
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      
      <View style={styles.backdrop}>
        <View style={styles.card}>

          <Text style={styles.title}>{mode === 'create' ? 'Add Player' : 'Edit Player'}</Text>

          {/* Avatar preview + actions */}
          <View style={styles.avatarRow}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={[styles.btn, styles.btnLight]} onPress={choosePhoto}>
                <Text style={[styles.btnText, styles.btnTextDark]}>Choose Photo</Text>
              </Pressable>
              {!!photoUri && (
                <Pressable style={[styles.btn, styles.btnDanger]} onPress={removePhoto}>
                  <Text style={styles.btnText}>Remove</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Names */}
          <Text style={styles.label}>First name</Text>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            style={styles.input}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Last name</Text>
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            style={styles.input}
            autoCapitalize="words"
          />

          {/* Positions (optional) */}
          <View style={styles.posHeaderRow}>
            <Text style={[styles.label, { marginBottom: 0 }]}>Positions (optional)</Text>
            <View style={styles.posHeaderBtns}>
              <Pressable
                style={[styles.posMiniBtn, styles.posMiniBtnLight]}
                onPress={() => setPositions([...POSITIONS_ALL])}
              >
                <Text style={[styles.posMiniBtnText, styles.posMiniBtnTextDark]}>Select all</Text>
              </Pressable>
              <Pressable
                style={[styles.posMiniBtn, styles.posMiniBtnLight]}
                onPress={() => setPositions([])}
              >
                <Text style={[styles.posMiniBtnText, styles.posMiniBtnTextDark]}>Clear all</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 6 }}
          >
            {POSITIONS_ALL.map(p => {
              const on = positions.includes(p);
              return (
                <Pressable
                  key={p}
                  onPress={() => togglePos(p)}
                  style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                >
                  <Text style={[styles.chipText, on ? styles.chipTextOn : styles.chipTextOff]}>
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={busy}>
              <Text style={[styles.btnText, styles.btnTextDark]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={doSave} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
	  
	  
   </TouchableWithoutFeedback>
  </KeyboardAvoidingView>

</Modal>

  );
}

const AVATAR_SIZE = 72;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },

  title: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: '#0f172a' },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, backgroundColor: '#e2e8f0' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0f172a', fontWeight: '900', fontSize: 18 },

  label: { color: '#334155', fontWeight: '700', marginTop: 6, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },

  posHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  posHeaderBtns: { flexDirection: 'row', gap: 8 },
  posMiniBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  posMiniBtnLight: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  posMiniBtnText: { fontWeight: '900' },
  posMiniBtnTextDark: { color: '#0f172a' },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipOff: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  chipText: { fontWeight: '900' },
  chipTextOn: { color: '#fff' },
  chipTextOff: { color: '#0f172a' },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 14 },

  btn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: '#dc2626' },
  btnLight: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  btnGhost: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  btnText: { color: '#fff', fontWeight: '900' },
  btnTextDark: { color: '#0f172a' },
});
