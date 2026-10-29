import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { AgentIconAvatar } from '../messages/AgentIconAvatar';
import { AIContextActions } from '../assist/AIContextActions';
import { AIAssistObjectReference } from '../assist/aiAssistTypes';
import { Language } from '../session/sessionTypes';

type XunTaskParticipant = {
  id: string;
  agent?: AgentDTO;
  displayName: string;
};

export function XunTaskCard({
  testID,
  palette,
  status,
  statusTone,
  time,
  participants,
  goal,
  description,
  openLabel,
  onOpen,
  accessibilityLabel,
  accessibilityHint,
  actionVariant = 'secondary',
  context,
  children,
}: {
  testID: string;
  palette: Palette;
  status: string;
  statusTone: 'attention' | 'progress' | 'error' | 'neutral';
  time: string;
  participants: XunTaskParticipant[];
  goal: string;
  description?: string | null;
  openLabel: string;
  onOpen: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  actionVariant?: 'primary' | 'secondary';
  context?: { object: AIAssistObjectReference; language: Language };
  children?: React.ReactNode;
}) {
  const detail = description?.trim();
  const statusStyle = {
    attention: { backgroundColor: '#fff1e5', color: '#e28a29' },
    progress: { backgroundColor: '#d5f7dd', color: '#64a52e' },
    error: { backgroundColor: palette.rose, color: palette.surface },
    neutral: { backgroundColor: palette.soft, color: palette.secondaryText },
  }[statusTone];

  const content = (
    <>
      <View style={s.topRow}>
        <Text numberOfLines={1} style={[s.status, statusStyle]}>
          {status}
        </Text>
        {time ? (
          <Text
            numberOfLines={1}
            style={[s.time, { color: palette.secondaryText }]}
          >
            {time}
          </Text>
        ) : null}
      </View>

      {participants.length ? (
        <ScrollView
          horizontal
          contentContainerStyle={s.participants}
          scrollEnabled={participants.length > 4}
          showsHorizontalScrollIndicator={false}
        >
          {participants.map(({ id, agent, displayName }) => (
            <View
              key={id}
              style={s.participant}
              testID={`xun-task-agent-${id}`}
            >
              <AgentIconAvatar
                agentId={id}
                category={agent?.category}
                identity={agent?.identity || null}
                size={31}
                // V20 task cards use circular glyphs; the rounded-square
                // portraits belong to the conversation list/detail views.
                variant="xun-task"
              />
              <Text
                numberOfLines={1}
                style={[s.participantName, { color: palette.secondaryText }]}
              >
                {displayName}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <Text numberOfLines={3} style={[s.goal, { color: palette.text }]}>
        {goal}
      </Text>
      {detail ? (
        <Text
          numberOfLines={3}
          style={[s.description, { color: palette.secondaryText }]}
        >
          {detail}
        </Text>
      ) : null}
      {children}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={openLabel}
        accessibilityHint={accessibilityHint}
        onPress={event => {
          event?.stopPropagation();
          onOpen();
        }}
        style={({ pressed }) => [
          s.action,
          {
            backgroundColor:
              actionVariant === 'primary' ? palette.mint : palette.surface,
            borderColor: palette.border,
            opacity: pressed ? 0.72 : 1,
          },
          actionVariant === 'secondary' && s.actionSecondary,
        ]}
      >
        <Text style={[s.actionText, { color: palette.text }]}>{openLabel}</Text>
      </Pressable>
    </>
  );

  return context ? (
    <AIContextActions
      testID={testID}
      object={context.object}
      language={context.language}
      palette={palette}
      openLabel={openLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onOpen={onOpen}
      style={[s.card, { backgroundColor: palette.surface }]}
    >
      {content}
    </AIContextActions>
  ) : (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onOpen}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: pressed ? palette.soft : palette.surface },
      ]}
    >
      {content}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 19,
    gap: 0,
    padding: 17,
    shadowColor: '#234055',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  status: {
    borderRadius: 14,
    fontSize: 11,
    fontWeight: '600',
    maxWidth: '72%',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  time: { fontSize: 12, lineHeight: 18, marginLeft: 8 },
  participants: {
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 19,
    marginTop: 10,
  },
  participant: { alignItems: 'center', gap: 5, maxWidth: 74, minWidth: 31 },
  participantName: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  goal: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 10,
  },
  description: { fontSize: 12, lineHeight: 19, marginBottom: 15 },
  action: {
    alignItems: 'center',
    borderRadius: 25,
    borderWidth: 0,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: '100%',
  },
  actionSecondary: { borderWidth: 1 },
  actionText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
});
