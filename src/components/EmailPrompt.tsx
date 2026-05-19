// src/components/EmailPrompt.tsx
// Bypasses the custom email popup entirely.
// When the email button is tapped:
//   - If MailComposer is available  → opens the device's native mail app directly
//   - If offline / no mail app      → saves to outbox and shows a confirmation
// No blocking modal, no broken OK/Cancel buttons.

import React, { useEffect, useRef } from 'react';
import * as MailComposer from 'expo-mail-composer';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSend: (addresses: string[]) => Promise<void>;
  sending?: boolean;
};

export default function EmailPrompt({ visible, onClose, onSend, sending }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!visible || firedRef.current || sending) return;
    firedRef.current = true;

    // Fire immediately — no popup, just open mail composer or queue
    onSend([]).finally(() => {
      firedRef.current = false;
      onClose();
    });
  }, [visible]);

  // Renders nothing — all work done via side effect above
  return null;
}
