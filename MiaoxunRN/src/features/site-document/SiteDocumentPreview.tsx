import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SiteDocumentView } from '../../models/siteDocument';
import { stationAgentApi } from '../../services/api/stationAgentApi';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspaceState,
  workspaceStyles,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
import { SiteDocumentRenderer } from './SiteDocumentRenderer';
import { Header } from '../../shared/ui';

export function SiteDocumentPreview({
  draftId,
  token,
  active,
  palette,
  language,
  expected,
  onReviewed,
  onInvalidated,
  onClose,
}: {
  draftId: string;
  token: string;
  active: boolean;
  palette: Palette;
  language: Language;
  expected?: { documentHash: string; resourcesHash: string };
  onReviewed?: () => void;
  onInvalidated?: () => void;
  onClose: () => void;
}) {
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const visibleActive = active && foreground;
  const requiresReview = expected !== undefined;
  const documentHash = expected?.documentHash;
  const resourcesHash = expected?.resourcesHash;
  const scope = `${token}:${draftId}:${expected?.documentHash || ''}:${
    expected?.resourcesHash || ''
  }`;
  const [result, setResult] = useState<{
    scope: string;
    generation: number;
    view?: SiteDocumentView;
    error?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const currentScope = useRef({ scope, active: visibleActive });
  currentScope.current = { scope, active: visibleActive };
  const review = useRef(onReviewed);
  review.current = onReviewed;
  const invalidate = useRef(onInvalidated);
  invalidate.current = onInvalidated;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') {
        generation.current += 1;
        setResult(null);
        invalidate.current?.();
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let current = true;
    const loadingGeneration = ++generation.current;
    setResult(null);
    invalidate.current?.();
    if (!visibleActive)
      return () => {
        current = false;
      };
    stationAgentApi
      .siteDocument(token, draftId)
      .then(view => {
        if (!current || generation.current !== loadingGeneration) return;
        if (
          requiresReview &&
          (documentHash !== view.documentHash ||
            resourcesHash !== view.resourcesHash)
        ) {
          throw new Error(
            textFor(
              language,
              '页面或引用内容已变化，请刷新任务并重新生成方案。',
              'The page or its references changed. Refresh the task and generate a new proposal.',
            ),
          );
        }
        setResult({ scope, generation: loadingGeneration, view });
      })
      .catch(error => {
        if (current && generation.current === loadingGeneration)
          setResult({
            scope,
            generation: loadingGeneration,
            error:
              error instanceof Error
                ? error.message
                : textFor(language, '无法读取页面', 'Unable to load the page'),
          });
      });
    return () => {
      current = false;
      generation.current += 1;
    };
  }, [
    scope,
    token,
    draftId,
    visibleActive,
    attempt,
    requiresReview,
    documentHash,
    resourcesHash,
    language,
  ]);
  const visible = result?.scope === scope && visibleActive ? result : null;
  const close = () => {
    // Keep a completed review for the parent's explicit save action, but never
    // allow a pending image or page response to complete after closing.
    generation.current += 1;
    onClose();
  };
  return (
    <Modal visible={visibleActive} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={[s.screen, { backgroundColor: palette.background }]}>
        <Header
          palette={palette}
          title={textFor(
            language,
            '页面预览 · 仅自己可见',
            'Page preview · Private',
          )}
          onBack={close}
        />
        <View testID={`site-draft-preview-${draftId}`} style={s.screen}>
          {visible?.view ? (
            <SiteDocumentRenderer
              key={visible.generation}
              view={visible.view}
              token={token}
              palette={palette}
              language={language}
              onReadinessChange={ready => {
                if (
                  !requiresReview ||
                  !currentScope.current.active ||
                  currentScope.current.scope !== visible.scope ||
                  generation.current !== visible.generation
                )
                  return;
                if (ready) review.current?.();
                else invalidate.current?.();
              }}
            />
          ) : (
            <WorkspaceState
              palette={palette}
              busy={!visible?.error && visibleActive}
              tone={visible?.error ? 'error' : undefined}
              title={
                visible?.error ||
                textFor(
                  language,
                  '正在读取页面及引用内容…',
                  'Loading the page and its references…',
                )
              }
            />
          )}
          {visible?.error ? (
            <View style={workspaceStyles.content}>
              <WorkspaceButton
                palette={palette}
                variant="secondary"
                label={textFor(language, '重新读取页面', 'Reload page')}
                onPress={() => setAttempt(value => value + 1)}
              />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({ screen: { flex: 1 } });
