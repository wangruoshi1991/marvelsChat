import { AlertCircle, CheckCircle2, Cuboid } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import {
  Avatar3DBootstrapDTO,
  Avatar3DJobDTO,
  Avatar3DQualityPresetId,
} from '../../models/api';
import { avatar3dReferenceImageUrl } from '../../services/api/avatar3dApi';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/useMiaoxunSession';
import {
  canCancelAvatar3dJob,
  isAvatar3dTerminalStatus,
} from './avatar3dWorkflow';
import {
  ScreenColors,
  formatCost,
  jobStatusCopy,
  referenceViewLabel,
} from './avatar3dCreatePresentation';
import { avatar3dCreateStyles as localStyles } from './avatar3dCreateStyles';
import { Avatar3DErrorNotice } from './Avatar3DCreateShared';
import { useAvatar3dWorkflow } from './useAvatar3dWorkflow';

export function Avatar3DJobView({
  colors,
  job,
  language,
  qualityPreset,
  qualityPresets,
  token,
  workflow,
  onQualityPresetChange,
  onManage,
}: {
  colors: ScreenColors;
  job: Avatar3DJobDTO;
  language: Language;
  qualityPreset: Avatar3DQualityPresetId | null;
  qualityPresets: Avatar3DBootstrapDTO['feature']['qualityPresets'];
  token: string;
  workflow: ReturnType<typeof useAvatar3dWorkflow>;
  onQualityPresetChange: (preset: Avatar3DQualityPresetId) => void;
  onManage: () => void;
}) {
  const terminal = isAvatar3dTerminalStatus(job.status);
  const awaitingReferences = job.status === 'awaiting_reference_confirmation';
  const progress = Math.max(0, Math.min(100, job.progress));
  const statusCopy = jobStatusCopy(language, job);
  const referenceImages = workflow.references
    ? [...workflow.references.images].sort(
        (left, right) => left.sequenceIndex - right.sequenceIndex,
      )
    : [];
  const referencesReady = referenceImages.length === 4;
  const selectedQuality = qualityPresets.find(
    option => option.id === qualityPreset,
  );

  const confirmReject = () => {
    Alert.alert(
      textFor(language, '放弃这组视图？', 'Reject these views?'),
      textFor(
        language,
        '本次任务将结束，已生成的参考视图不会用于3D建模。',
        'This task will end and these references will not be modeled.',
      ),
      [
        {
          text: textFor(language, '继续查看', 'Keep Reviewing'),
          style: 'cancel',
        },
        {
          text: textFor(language, '放弃', 'Reject'),
          style: 'destructive',
          onPress: () => workflow.rejectReferences().catch(() => undefined),
        },
      ],
    );
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={localStyles.jobContent}
        style={localStyles.bodyScroll}
        testID="avatar3d-job-scroll"
      >
        <View
          style={[
            localStyles.progressSection,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              localStyles.jobIcon,
              { backgroundColor: terminal ? colors.soft : colors.accent },
            ]}
          >
            {terminal ? (
              job.status === 'succeeded' ? (
                <CheckCircle2 color={colors.accent} size={30} />
              ) : (
                <AlertCircle color={colors.danger} size={30} />
              )
            ) : (
              <Cuboid color="#FFFFFF" size={30} strokeWidth={1.8} />
            )}
          </View>
          <Text style={[localStyles.jobTitle, { color: colors.text }]}>
            {statusCopy.title}
          </Text>
          <Text style={[localStyles.jobBody, { color: colors.muted }]}>
            {statusCopy.body}
          </Text>
          {!terminal && !awaitingReferences ? (
            <>
              <View
                style={[
                  localStyles.progressTrack,
                  { backgroundColor: colors.soft },
                ]}
              >
                <View
                  style={[
                    localStyles.progressFill,
                    { backgroundColor: colors.accent, width: `${progress}%` },
                  ]}
                />
              </View>
              <Text
                style={[localStyles.progressValue, { color: colors.muted }]}
              >
                {progress}%
              </Text>
            </>
          ) : null}
        </View>

        {awaitingReferences ? (
          <View
            style={[
              localStyles.referenceSection,
              {
                backgroundColor: colors.surface,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <Text style={[localStyles.referenceTitle, { color: colors.text }]}>
              {textFor(language, '确认四个视角', 'Confirm Four Views')}
            </Text>
            <Text style={[localStyles.referenceHint, { color: colors.muted }]}>
              {textFor(
                language,
                '请确认人物外观和服装一致，再继续生成3D模型。',
                'Check the appearance and clothing before 3D generation.',
              )}
            </Text>
            {workflow.references ? (
              <View style={localStyles.referenceGrid}>
                {referenceImages.map(image => (
                  <View key={image.id} style={localStyles.referenceItem}>
                    <Image
                      resizeMode="cover"
                      source={{
                        headers: { Authorization: `Bearer ${token}` },
                        uri: avatar3dReferenceImageUrl(job.id, image.view),
                      }}
                      style={localStyles.referenceImage}
                    />
                    <Text style={localStyles.referenceLabel}>
                      {referenceViewLabel(language, image.view)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={localStyles.referenceLoading}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
            {workflow.references ? (
              <View
                style={[
                  localStyles.referenceQuality,
                  { borderTopColor: colors.border },
                ]}
                testID="avatar3d-quality-options"
              >
                <Text
                  style={[
                    localStyles.referenceQualityTitle,
                    { color: colors.text },
                  ]}
                >
                  {textFor(language, '3D 生成精度', '3D Generation Quality')}
                </Text>
                <Text
                  style={[
                    localStyles.referenceQualityHint,
                    { color: colors.muted },
                  ]}
                >
                  {selectedQuality?.description || ''}
                </Text>
                <View style={localStyles.qualitySegment}>
                  {qualityPresets.map(option => {
                    const selected = option.id === qualityPreset;
                    return (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        disabled={workflow.busyAction !== 'none'}
                        key={option.id}
                        onPress={() => onQualityPresetChange(option.id)}
                        style={[
                          localStyles.qualitySegmentButton,
                          {
                            backgroundColor: selected
                              ? colors.accent
                              : colors.soft,
                            borderColor: selected
                              ? colors.accent
                              : colors.border,
                          },
                        ]}
                        testID={`avatar3d-quality-${option.id}`}
                      >
                        <Text
                          style={[
                            localStyles.qualitySegmentLabel,
                            { color: colors.text },
                            selected && localStyles.optionTextSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View
                  style={[
                    localStyles.costSummary,
                    { backgroundColor: colors.soft },
                  ]}
                  testID="avatar3d-model-cost"
                >
                  <View style={localStyles.costSummaryCopy}>
                    <Text
                      style={[
                        localStyles.costSummaryTitle,
                        { color: colors.text },
                      ]}
                    >
                      {textFor(
                        language,
                        '确认后开始 3D 建模',
                        'Start 3D modeling after confirmation',
                      )}
                    </Text>
                    <Text
                      style={[
                        localStyles.costSummaryHint,
                        { color: colors.muted },
                      ]}
                    >
                      {textFor(
                        language,
                        '精度可在确认前调整',
                        'Quality can be changed before confirmation',
                      )}
                    </Text>
                  </View>
                  <Text
                    style={[
                      localStyles.costSummaryValue,
                      { color: colors.accent },
                    ]}
                  >
                    {selectedQuality
                      ? `${textFor(language, '预计 ', 'Est. ')}${formatCost(
                          selectedQuality.estimatedCostFen,
                        )}`
                      : ''}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {workflow.errorMessage ? (
          <Avatar3DErrorNotice
            colors={colors}
            message={workflow.errorMessage}
          />
        ) : null}

        {!terminal &&
        canCancelAvatar3dJob(job.status) &&
        !awaitingReferences ? (
          <Pressable
            accessibilityRole="button"
            disabled={workflow.busyAction !== 'none'}
            onPress={() => {
              Alert.alert(
                textFor(language, '取消生成？', 'Cancel generation?'),
                textFor(
                  language,
                  '任务尚未进入不可取消阶段。',
                  'This task can still be cancelled.',
                ),
                [
                  {
                    text: textFor(language, '继续生成', 'Keep Going'),
                    style: 'cancel',
                  },
                  {
                    text: textFor(language, '取消任务', 'Cancel Task'),
                    style: 'destructive',
                    onPress: () => workflow.cancelJob().catch(() => undefined),
                  },
                ],
              );
            }}
            style={localStyles.cancelCommand}
          >
            <Text
              style={[localStyles.cancelCommandText, { color: colors.danger }]}
            >
              {textFor(language, '取消本次生成', 'Cancel Generation')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {awaitingReferences ? (
        <View
          style={[
            localStyles.footer,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <View style={localStyles.referenceActions}>
            <Pressable
              accessibilityRole="button"
              disabled={workflow.busyAction !== 'none' || !workflow.references}
              onPress={confirmReject}
              style={[
                localStyles.secondaryButton,
                { borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  localStyles.secondaryButtonText,
                  { color: colors.text },
                ]}
              >
                {textFor(language, '放弃', 'Reject')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={
                workflow.busyAction !== 'none' ||
                !referencesReady ||
                !qualityPreset
              }
              onPress={() =>
                qualityPreset
                  ? workflow
                      .confirmReferences(qualityPreset)
                      .catch(() => undefined)
                  : undefined
              }
              style={[
                localStyles.primaryButton,
                localStyles.referencePrimaryButton,
                { backgroundColor: colors.accent },
                (workflow.busyAction !== 'none' ||
                  !referencesReady ||
                  !qualityPreset) &&
                  localStyles.buttonDisabled,
              ]}
              testID="avatar3d-confirm-references"
            >
              {workflow.busyAction === 'confirming' ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : null}
              <Text style={localStyles.primaryButtonText}>
                {textFor(
                  language,
                  '确认四视图并生成 3D',
                  'Confirm Views and Generate 3D',
                )}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : terminal ? (
        <View
          style={[
            localStyles.footer,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={onManage}
            style={[
              localStyles.primaryButton,
              { backgroundColor: colors.accent },
            ]}
          >
            <Text style={localStyles.primaryButtonText}>
              {job.status === 'succeeded'
                ? textFor(language, '查看我的形象', 'View My Avatar')
                : textFor(language, '返回形象管理', 'Back to Avatars')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}
