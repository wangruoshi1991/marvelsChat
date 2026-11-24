import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  acknowledgeDirectMessageDelivery,
  ChatMessageReceiptAvailability,
  DirectMessageReceiptStatus,
  loadDirectMessageReceipts,
} from '../../services/api/messageReceiptApi';
import type { ChatThread } from '../session/sessionTypes';

const identifier = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Receiving means this authenticated client loaded the message in a visible,
// foreground conversation. It does not mean the person read or played it.
export function useDirectMessageReceipts({
  thread,
  token,
  currentUserId,
  availability,
  active = true,
}: {
  thread: ChatThread;
  token?: string;
  currentUserId: string;
  availability?: ChatMessageReceiptAvailability;
  active?: boolean;
}) {
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    statuses: Record<string, DirectMessageReceiptStatus>;
    syncError: boolean;
  } | null>(null);
  const received = useRef<{ scope: string; handled: Set<string> } | null>(null);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const supported =
    availability?.directDelivery === 1 && availability.readDisclosure === false;
  const enabled = Boolean(
    supported &&
      active &&
      foreground &&
      token &&
      currentUserId &&
      thread.kind === 'direct' &&
      thread.peerUserId &&
      !thread.agentId &&
      !thread.groupId,
  );
  const scope = JSON.stringify([
    token,
    currentUserId,
    thread.id,
    thread.peerUserId,
  ]);
  const messages = thread.messages.filter(
    message =>
      message.threadId === thread.id &&
      identifier.test(message.id) &&
      message.senderType === 'user' &&
      !message.localStatus &&
      !message.deletedAt &&
      !message.recalledAt,
  );
  const incoming = messages
    .filter(message => message.metadata?.senderUserId === thread.peerUserId)
    .slice(-50)
    .map(message => message.id);
  const outgoing = messages
    .filter(message => message.metadata?.senderUserId === currentUserId)
    .map(message => message.id);
  const recentOutgoing = outgoing.slice(-50);
  const incomingKey = JSON.stringify(incoming);
  const incomingIds = useRef(incoming);
  incomingIds.current = incoming;
  const wakeAck = useRef<(() => void) | null>(null);
  const outgoingKey = JSON.stringify(recentOutgoing);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !token) return;
    const handled =
      received.current?.scope === scope
        ? received.current.handled
        : new Set<string>();
    received.current = { scope, handled };

    let cancelled = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const acknowledge = async () => {
      if (cancelled || busy || timer) return;
      const ids = new Set(incomingIds.current);
      for (const id of handled) if (!ids.has(id)) handled.delete(id);
      const batch = [...ids].filter(id => !handled.has(id));
      if (!batch.length) {
        setReceiveError(null);
        return;
      }

      busy = true;
      try {
        await acknowledgeDirectMessageDelivery(thread.id, batch, token);
        if (cancelled) return;
        // A successful batch has handled omitted IDs too. Only the server
        // may confirm delivery, even when an ACK request succeeds.
        batch.forEach(id => handled.add(id));
      } catch {
        if (cancelled) return;
        setReceiveError(scope);
        timer = setTimeout(() => {
          timer = undefined;
          acknowledge();
        }, 5000);
      } finally {
        busy = false;
      }
      // New messages may have arrived while the ACK was in flight.
      if (!cancelled && !timer) acknowledge();
    };
    wakeAck.current = acknowledge;
    acknowledge();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      wakeAck.current = null;
    };
  }, [enabled, scope, thread.id, token]);

  useEffect(() => {
    wakeAck.current?.();
  }, [incomingKey]);

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ids: string[] = JSON.parse(outgoingKey);
    const delivered = new Set<string>();
    const refresh = async () => {
      const batch = ids.filter(id => !delivered.has(id));
      if (!batch.length) return;
      try {
        const receipts = await loadDirectMessageReceipts(
          thread.id,
          batch,
          token,
        );
        if (cancelled) return;
        receipts.forEach(receipt => {
          if (receipt.status === 'delivered') delivered.add(receipt.messageId);
        });
        setSnapshot(current => ({
          scope,
          statuses: {
            ...(current?.scope === scope ? current.statuses : {}),
            ...Object.fromEntries(
              receipts
                .filter(receipt => receipt.status === 'delivered')
                .map(receipt => [receipt.messageId, receipt.status]),
            ),
          },
          syncError: false,
        }));
      } catch {
        if (cancelled) return;
        setSnapshot(current => ({
          scope,
          statuses: current?.scope === scope ? current.statuses : {},
          syncError: true,
        }));
      }
      if (ids.some(id => !delivered.has(id))) timer = setTimeout(refresh, 5000);
    };
    refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, outgoingKey, scope, thread.id, token]);

  const statuses: Record<string, DirectMessageReceiptStatus> = {};
  const saved = supported && snapshot?.scope === scope ? snapshot.statuses : {};
  if (thread.kind === 'direct' && !thread.agentId && !thread.groupId) {
    for (const id of recentOutgoing) statuses[id] = 'accepted';
    for (const id of outgoing)
      if (saved[id] === 'delivered') statuses[id] = 'delivered';
  }
  return {
    statuses,
    supported,
    syncError: Boolean(
      enabled &&
        (receiveError === scope ||
          (snapshot?.scope === scope && snapshot.syncError)),
    ),
  };
}
