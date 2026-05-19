// src/components/ui.tsx
// Shared UI primitives used across the app
import React, { useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Easing,
  ActivityIndicator, ViewStyle, TextStyle,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

// ─── FlashButton ────────────────────────────────────────────────────────────
type FlashButtonProps = {
  label: string;
  onPress: () => Promise<void> | void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  baseColor: string;
  flashColor?: string;
  disabled?: boolean;
};

export function FlashButton({ label, onPress, style, textStyle, baseColor, flashColor = '#ffffff', disabled }: FlashButtonProps) {
  const anim = useRef(new Animated.Value(0)).current;
  const flashing = useRef(false);

  const runFlash = () => {
    if (flashing.current) return;
    flashing.current = true;
    anim.setValue(0.85);
    Animated.timing(anim, { toValue: 0, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(() => { flashing.current = false; });
  };

  const handlePress = async () => {
    if (disabled) return;
    runFlash();
    await onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [style, { backgroundColor: baseColor, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <Text style={textStyle}>{label}</Text>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: flashColor, opacity: anim, borderRadius: 10 }]}
      />
    </Pressable>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────
export function Toast({ message, visible }: { message: string; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, message]);

  return (
    <Animated.View style={[toastStyles.wrap, { opacity }]} pointerEvents="none">
      <Text style={toastStyles.text}>{message}</Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: 80, alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.92)', paddingHorizontal: 18,
    paddingVertical: 10, borderRadius: 20, zIndex: 999,
  },
  text: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ─── OfflineBanner ───────────────────────────────────────────────────────────
export function OfflineBanner({ visible }: { visible: boolean }) {
  const { theme } = useTheme();
  if (!visible) return null;
  return (
    <View style={[offlineStyles.bar, { backgroundColor: theme.colors.offlineBg }]}>
      <Text style={[offlineStyles.text, { color: theme.colors.offlineText }]}>
        📵 Offline — reports will send when reconnected
      </Text>
    </View>
  );
}

const offlineStyles = StyleSheet.create({
  bar: { paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  text: { fontWeight: '700', fontSize: 12 },
});

// ─── ErrorBoundary ────────────────────────────────────────────────────────────
type EBState = { hasError: boolean; error?: Error };
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: '#64748b', textAlign: 'center' }}>{this.state.error?.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  return (
    <View style={[{ backgroundColor: theme.colors.card, borderColor: theme.colors.cardBorder, borderWidth: 1, borderRadius: 12, padding: 12 }, style]}>
      {children}
    </View>
  );
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
type BtnProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'ghost' | 'success';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export function Btn({ label, onPress, variant = 'primary', disabled, loading, style, textStyle }: BtnProps) {
  const { theme } = useTheme();
  const bg =
    variant === 'primary' ? theme.colors.primary :
    variant === 'danger'  ? theme.colors.danger  :
    variant === 'success' ? theme.colors.success  :
    theme.colors.card;
  const tc =
    variant === 'ghost' ? theme.colors.text : '#fff';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        backgroundColor: bg,
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        opacity: (disabled || loading) ? 0.5 : pressed ? 0.85 : 1,
        ...(variant === 'ghost' ? { borderWidth: 1, borderColor: theme.colors.cardBorder } : {}),
      }, style]}
    >
      {loading
        ? <ActivityIndicator color={tc} size="small" />
        : <Text style={[{ color: tc, fontWeight: '900', fontSize: 14 }, textStyle]}>{label}</Text>}
    </Pressable>
  );
}
