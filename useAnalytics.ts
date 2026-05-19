// src/components/EmailPrompt.tsx
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_EMAIL_KEY = 'last_recipient_email';

export default function EmailPrompt({
  visible,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  onSubmit: (email: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');

  // Load last used email when opened
  useEffect(() => {
    (async () => {
      if (visible) {
        const saved = await AsyncStorage.getItem(LAST_EMAIL_KEY);
        if (saved) setEmail(saved);
      }
    })();
  }, [visible]);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (trimmed) {
      await AsyncStorage.setItem(LAST_EMAIL_KEY, trimmed);
    }
    onSubmit(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Enter email address</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="coach@example.com"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />

          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.ghost]} onPress={onCancel}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>

            <Pressable style={[styles.btn, styles.primary]} onPress={handleSubmit}>
              <Text style={styles.btnPrimaryText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '88%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  title: {
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 10,
    color: '#0f172a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primary: {
    backgroundColor: '#2563eb',
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '800',
  },
  ghost: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  btnGhostText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});