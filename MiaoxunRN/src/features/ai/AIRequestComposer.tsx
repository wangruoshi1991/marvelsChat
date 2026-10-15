import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowLeft, ArrowUpRight } from 'lucide-react-native';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceState,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
import { workspacePalette } from '../../shared/workspacePalette';
import {
  AIAssistObjectReference,
  AIAssistScene,
} from '../assist/aiAssistTypes';
import {
  assistContextSummary,
  assistMessageLimit,
  buildAssistMessage,
} from '../assist/assistRequest';
import { persistentAssistReference } from './assistContext';
import { ContextReference } from './AIInteraction';
import { AIContextReference } from '../../models/aiTask';

export function AIRequestComposer({
  palette,
  language,
  draft,
  scene,
  context,
  references = [],
  onRemoveReference,
  onRemoveContext,
  onChangeDraft,
  onClose,
  onContinue,
  recovery,
}: {
  palette: Palette;
  language: Language;
  draft: string;
  scene?: AIAssistScene;
  context?: AIAssistObjectReference;
  references?: AIContextReference[];
  onRemoveReference?: (index: number) => void;
  onRemoveContext?: () => void;
  onChangeDraft: (draft: string) => void;
  onClose: () => void;
  onContinue: (draft: string) => boolean;
  recovery?: React.ReactNode;
}) {
  const colors = workspacePalette(palette);
  const [error, setError] = useState(false);
  const summary = assistContextSummary(scene, context, language);
  const reference = context ? persistentAssistReference(context) : null;
  const message = buildAssistMessage(draft, scene, context, language);
  const tooLong = message.length > assistMessageLimit;
  return (
    <KeyboardAvoidingView
      style={[s.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            '收起需求草稿',
            'Close request draft',
          )}
          onPress={onClose}
          style={s.back}
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[
            workspaceTokens.typography.heading,
            s.title,
            { color: colors.text },
          ]}
        >
          {textFor(language, '说说你想做的事', 'What would you like to do?')}
        </Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {recovery}
        {summary ? (
          <WorkspacePanel palette={colors}>
            {reference ? (
              <ContextReference
                palette={colors}
                language={language}
                references={[reference]}
              />
            ) : (
              <Text
                selectable
                testID="assist-context-summary"
                style={[
                  workspaceTokens.typography.body,
                  { color: colors.secondaryText },
                ]}
              >
                {summary}
              </Text>
            )}
            {context && onRemoveContext ? (
              <WorkspaceButton
                palette={colors}
                variant="ghost"
                label={textFor(
                  language,
                  '移除选中内容',
                  'Remove selected item',
                )}
                onPress={onRemoveContext}
              />
            ) : null}
          </WorkspacePanel>
        ) : null}
        {references.length ? (
          <WorkspacePanel palette={colors}>
            <Text
              style={[workspaceTokens.typography.title, { color: colors.text }]}
            >
              {textFor(language, '本次引用的内容', 'Content for this request')}
            </Text>
            <ContextReference
              references={references}
              onRemove={onRemoveReference}
              palette={colors}
              language={language}
            />
          </WorkspacePanel>
        ) : null}
        <TextInput
          testID="miao-request-input"
          accessibilityLabel={textFor(language, '需求草稿', 'Request draft')}
          placeholder={textFor(
            language,
            '输入需求，或修改刚才说的话…',
            'Describe your request, or edit your transcript…',
          )}
          placeholderTextColor={colors.secondaryText}
          value={draft}
          onChangeText={text => {
            setError(false);
            onChangeDraft(text);
          }}
          multiline
          editable
          autoFocus={!context}
          maxLength={
            draft.length > assistMessageLimit ? undefined : assistMessageLimit
          }
          style={[s.input, { color: colors.text }]}
        />
        {tooLong ? (
          <WorkspaceState
            palette={colors}
            tone="error"
            title={textFor(
              language,
              `需求和上下文共 ${message.length} 字，最多 ${assistMessageLimit} 字，请精简或移除选中内容。`,
              `Request and context total ${message.length} characters; maximum ${assistMessageLimit}. Shorten the request or remove the selected item.`,
            )}
          />
        ) : null}
      </ScrollView>
      <View style={s.footer}>
        {error ? (
          <WorkspaceState
            palette={colors}
            tone="error"
            title={textFor(
              language,
              '妙管家会话不可用，请到我页添加后重试。草稿已保留。',
              'The assistant chat is unavailable. Add it in Me and retry. Your draft is retained.',
            )}
          />
        ) : null}
        <Text
          style={[
            workspaceTokens.typography.caption,
            { color: colors.secondaryText },
          ]}
        >
          {textFor(
            language,
            '妙管家会按需邀请你的 AI 伙伴协作。',
            'Butler will involve your AI partners as needed.',
          )}
        </Text>
        <WorkspaceButton
          palette={colors}
          label={textFor(language, '交给妙管家', 'Review with Butler')}
          icon={<ArrowUpRight color={colors.surface} size={19} />}
          disabled={!draft.trim() || tooLong}
          onPress={() => setError(!onContinue(message))}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: workspaceTokens.space.xl,
    minHeight: 56,
  },
  back: {
    minHeight: 52,
    minWidth: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: workspaceTokens.space.lg,
    gap: workspaceTokens.space.md,
  },
  input: {
    flexGrow: 1,
    minHeight: 120,
    fontSize: 18,
    lineHeight: 28,
    textAlignVertical: 'top',
  },
  footer: { padding: workspaceTokens.space.lg, gap: workspaceTokens.space.md },
});
