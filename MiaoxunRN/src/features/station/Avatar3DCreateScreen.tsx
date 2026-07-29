import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Cuboid,
  ImagePlus,
  Trash2,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { contactIconAssets } from '../../assets/icons';
import {
  Avatar3DBootstrapDTO,
  Avatar3DJobDTO,
  Avatar3DModelDTO,
  Avatar3DQualityPresetId,
} from '../../models/api';
import {
  avatar3dModelThumbnailUrl,
  avatar3dReferenceImageUrl,
} from '../../services/api/avatar3dApi';
import {
  PickedStationMedia,
  pickStationPhotoFromLibrary,
} from '../../services/stationMediaPicker';
import { textFor } from '../../shared/i18n';
import { Palette, palettes } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import {
  canCancelAvatar3dJob,
  isAvatar3dTerminalStatus,
} from './avatar3dWorkflow';
import { useAvatar3dWorkflow } from './useAvatar3dWorkflow';

type BodyShape = 'balanced' | 'slender' | 'athletic';
type Outfit = 'business' | 'smart_casual' | 'casual' | 'sport' | 'formal';

const bodyShapeOptions = (language: Language) => [
  {
    label: textFor(language, '匀称', 'Balanced'),
    value: 'balanced' as const,
  },
  {
    label: textFor(language, '修长', 'Slender'),
    value: 'slender' as const,
  },
  {
    label: textFor(language, '运动感', 'Athletic'),
    value: 'athletic' as const,
  },
];

const outfitOptions = (language: Language) => [
  {
    label: textFor(language, '商务休闲', 'Smart Casual'),
    value: 'smart_casual' as const,
  },
  {
    label: textFor(language, '日常休闲', 'Casual'),
    value: 'casual' as const,
  },
  {
    label: textFor(language, '商务', 'Business'),
    value: 'business' as const,
  },
  {
    label: textFor(language, '运动', 'Sport'),
    value: 'sport' as const,
  },
  {
    label: textFor(language, '正式', 'Formal'),
    value: 'formal' as const,
  },
];

const formatCost = (fen: number) => `¥${(fen / 100).toFixed(2)}`;

export function Avatar3DCreateScreen({
  palette,
  language,
  token,
  initialBootstrap,
  onBack,
  onChanged,
}: {
  palette: Palette;
  language: Language;
  token: string;
  initialBootstrap: Avatar3DBootstrapDTO | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const workflow = useAvatar3dWorkflow({
    initialBootstrap,
    onChanged,
    token,
  });
  const [showComposer, setShowComposer] = useState(
    !initialBootstrap?.models.length,
  );
  const [media, setMedia] = useState<PickedStationMedia | null>(null);
  const [bodyShape, setBodyShape] = useState<BodyShape>('balanced');
  const [outfit, setOutfit] = useState<Outfit>('smart_casual');
  const [qualityPreset, setQualityPreset] =
    useState<Avatar3DQualityPresetId | null>(
      initialBootstrap?.feature.defaultQualityPreset || null,
    );
  const [description, setDescription] = useState('');
  const [acceptedIdentity, setAcceptedIdentity] = useState(false);
  const [acceptedFaceCompletion, setAcceptedFaceCompletion] = useState(false);

  const isDark = palette.text === palettes.dark.text;
  const colors = {
    accent: isDark ? '#8F86FF' : '#2012D9',
    background: isDark ? palette.background : '#F8F7FD',
    border: isDark ? palette.border : '#F0EBFD',
    danger: '#E8435A',
    muted: isDark ? palette.secondaryText : 'rgba(0,0,0,0.60)',
    soft: isDark ? palette.soft : '#F4F6FF',
    surface: isDark ? palette.surface : '#FFFFFF',
    text: isDark ? palette.text : '#000000',
  };

  useEffect(() => {
    if (workflow.bootstrap && !qualityPreset) {
      setQualityPreset(workflow.bootstrap.feature.defaultQualityPreset);
    }
  }, [qualityPreset, workflow.bootstrap]);

  useEffect(() => {
    if (!workflow.isSubmissionUncertain || !workflow.pendingOptions) {
      return;
    }
    setBodyShape(workflow.pendingOptions.bodyShape);
    setOutfit(workflow.pendingOptions.outfit);
    setQualityPreset(workflow.pendingOptions.qualityPreset);
    setDescription(workflow.pendingOptions.userDescription);
    setAcceptedIdentity(true);
    setAcceptedFaceCompletion(true);
  }, [workflow.isSubmissionUncertain, workflow.pendingOptions]);

  const isBusy = workflow.busyAction !== 'none';
  const allConsentsAccepted = acceptedIdentity && acceptedFaceCompletion;
  const canGenerate = Boolean(
    workflow.validatedPhoto &&
      allConsentsAccepted &&
      workflow.bootstrap?.feature.generationAvailable &&
      !isBusy,
  );

  const choosePhoto = async () => {
    if (workflow.isSubmissionUncertain) {
      workflow.setErrorMessage('上次提交结果尚未确认，请先重试原提交。');
      return;
    }
    try {
      const nextMedia = await pickStationPhotoFromLibrary();
      if (!nextMedia) {
        return;
      }
      await workflow.discardDraft();
      setMedia(nextMedia);
      workflow.setErrorMessage('');
    } catch (error) {
      workflow.setErrorMessage(
        error instanceof Error ? error.message : '无法选择照片',
      );
    }
  };

  const submitComposer = async () => {
    if (!workflow.validatedPhoto) {
      if (media) {
        await workflow.validatePhoto(media).catch(() => undefined);
      }
      return;
    }
    if (!canGenerate && !workflow.isSubmissionUncertain) {
      return;
    }
    const feature = workflow.bootstrap?.feature;
    if (!feature) {
      return;
    }
    const create = () =>
      workflow
        .createJob({
          bodyShape,
          outfit,
          qualityPreset: feature.defaultQualityPreset,
          userDescription: description,
        })
        .catch(() => undefined);
    if (workflow.isSubmissionUncertain) {
      await create();
      return;
    }
    const selectedBody = bodyShapeOptions(language).find(
      option => option.value === bodyShape,
    );
    const selectedOutfit = outfitOptions(language).find(
      option => option.value === outfit,
    );
    Alert.alert(
      textFor(language, '确认生成四视图', 'Confirm Four Views'),
      textFor(
        language,
        `照片：1 张正面脸照\n身材：${selectedBody?.label}\n服装：${
          selectedOutfit?.label
        }\n预计费用：${formatCost(
          feature.referenceGenerationEstimatedCostFen,
        )}\n\n此步骤只生成四视图，确认效果后才会开始 3D 建模。`,
        `Photo: 1 front-facing portrait\nBody: ${
          selectedBody?.label
        }\nOutfit: ${selectedOutfit?.label}\nEstimated cost: ${formatCost(
          feature.referenceGenerationEstimatedCostFen,
        )}\n\nThis step only generates four reference views. 3D modeling starts after your review.`,
      ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '确认生成', 'Generate'),
          onPress: () => {
            create().catch(() => undefined);
          },
        },
      ],
    );
  };

  const closeScreen = async () => {
    await workflow.discardDraft();
    onBack();
  };

  const title = workflow.job
    ? textFor(language, '3D形象生成', '3D Avatar')
    : showComposer
    ? textFor(language, '创建3D形象', 'Create 3D Avatar')
    : textFor(language, '我的3D形象', 'My 3D Avatars');

  return (
    <View
      accessibilityViewIsModal
      style={[localStyles.screen, { backgroundColor: colors.background }]}
      testID="avatar3d-create-screen"
    >
      <View
        style={[
          localStyles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          accessibilityLabel={textFor(language, '返回', 'Back')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => closeScreen().catch(() => undefined)}
          style={localStyles.headerButton}
        >
          <Image
            resizeMode="contain"
            source={contactIconAssets.back}
            style={localStyles.backIcon}
          />
        </Pressable>
        <Text style={[localStyles.headerTitle, { color: colors.text }]}>
          {title}
        </Text>
        <View style={localStyles.headerButton} />
      </View>

      {workflow.job ? (
        <JobView
          colors={colors}
          job={workflow.job}
          language={language}
          qualityPreset={qualityPreset}
          qualityPresets={workflow.bootstrap?.feature.qualityPresets || []}
          onQualityPresetChange={setQualityPreset}
          token={token}
          workflow={workflow}
          onManage={() => {
            workflow
              .dismissJob()
              .then(() => setShowComposer(false))
              .catch(() => undefined);
          }}
        />
      ) : showComposer ? (
        <>
          <ScrollView
            contentContainerStyle={localStyles.composerContent}
            keyboardShouldPersistTaps="handled"
            style={localStyles.bodyScroll}
            testID="avatar3d-composer-scroll"
          >
            <Section
              colors={colors}
              title={textFor(language, '正面脸照', 'Front-facing Portrait')}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => choosePhoto().catch(() => undefined)}
                style={[
                  localStyles.photoPicker,
                  { backgroundColor: colors.soft, borderColor: colors.border },
                ]}
              >
                {media ? (
                  <Image
                    resizeMode="cover"
                    source={{ uri: media.uri }}
                    style={localStyles.photoPreview}
                  />
                ) : workflow.validatedPhoto ? (
                  <View style={localStyles.photoPlaceholder}>
                    <CheckCircle2 color="#1B9A68" size={28} strokeWidth={1.8} />
                    <Text
                      style={[
                        localStyles.photoPickerTitle,
                        { color: colors.text },
                      ]}
                    >
                      {textFor(
                        language,
                        '已恢复上次检查通过的照片',
                        'Previous checked photo restored',
                      )}
                    </Text>
                  </View>
                ) : (
                  <View style={localStyles.photoPlaceholder}>
                    <ImagePlus
                      color={colors.accent}
                      size={28}
                      strokeWidth={1.8}
                    />
                    <Text
                      style={[
                        localStyles.photoPickerTitle,
                        { color: colors.text },
                      ]}
                    >
                      {textFor(language, '选择一张照片', 'Select a photo')}
                    </Text>
                    <Text
                      style={[
                        localStyles.photoPickerHint,
                        { color: colors.muted },
                      ]}
                    >
                      {textFor(
                        language,
                        '清楚展示脸部即可，仅支持单人 JPG 或 PNG 照片',
                        'Use one clear JPG or PNG portrait with a visible face',
                      )}
                    </Text>
                  </View>
                )}
              </Pressable>
              {media ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={workflow.isSubmissionUncertain}
                  onPress={() => choosePhoto().catch(() => undefined)}
                  style={localStyles.inlineCommand}
                >
                  <Camera color={colors.accent} size={16} />
                  <Text
                    style={[
                      localStyles.inlineCommandText,
                      { color: colors.accent },
                    ]}
                  >
                    {textFor(language, '重新选择', 'Replace')}
                  </Text>
                </Pressable>
              ) : null}
              {workflow.validatedPhoto ? (
                <View
                  style={[
                    localStyles.validationResult,
                    { backgroundColor: colors.soft },
                  ]}
                >
                  <CheckCircle2 color="#1B9A68" size={20} />
                  <View style={localStyles.validationCopy}>
                    <Text
                      style={[
                        localStyles.validationTitle,
                        { color: colors.text },
                      ]}
                    >
                      {workflow.validatedPhoto.quality?.level === 'advisory'
                        ? textFor(
                            language,
                            '照片可用，建议优化',
                            'Photo accepted with advice',
                          )
                        : textFor(
                            language,
                            '照片检查通过',
                            'Photo check passed',
                          )}
                    </Text>
                    {workflow.validatedPhoto.quality?.suggestions.map(item => (
                      <Text
                        key={item}
                        style={[
                          localStyles.validationAdvice,
                          { color: colors.muted },
                        ]}
                      >
                        {item}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}
            </Section>

            <Section
              colors={colors}
              title={textFor(language, '身材方向', 'Body Direction')}
            >
              <OptionRow
                colors={colors}
                options={bodyShapeOptions(language)}
                value={bodyShape}
                onChange={setBodyShape}
                disabled={workflow.isSubmissionUncertain}
              />
            </Section>

            <Section
              colors={colors}
              title={textFor(language, '服装方向', 'Outfit Direction')}
            >
              <OptionRow
                colors={colors}
                options={outfitOptions(language)}
                value={outfit}
                onChange={setOutfit}
                disabled={workflow.isSubmissionUncertain}
                wrap
              />
            </Section>

            <Section
              colors={colors}
              title={textFor(language, '补充要求', 'Additional Request')}
            >
              <TextInput
                editable={!workflow.isSubmissionUncertain}
                maxLength={240}
                multiline
                onChangeText={setDescription}
                placeholder={textFor(
                  language,
                  '可补充发型、服装颜色等要求',
                  'Optional hair or clothing details',
                )}
                placeholderTextColor={colors.muted}
                style={[
                  localStyles.descriptionInput,
                  {
                    backgroundColor: colors.soft,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={description}
              />
              <Text
                style={[localStyles.characterCount, { color: colors.muted }]}
              >
                {description.length}/240
              </Text>
            </Section>

            <Section
              colors={colors}
              title={textFor(language, '授权确认', 'Consent')}
            >
              <ConsentRow
                checked={acceptedIdentity}
                colors={colors}
                label={textFor(
                  language,
                  '确认拥有照片使用授权，且照片中的人物已成年',
                  'I have permission to use this photo and the person is an adult',
                )}
                onChange={setAcceptedIdentity}
                disabled={workflow.isSubmissionUncertain}
              />
              <ConsentRow
                checked={acceptedFaceCompletion}
                colors={colors}
                label={textFor(
                  language,
                  '同意 AI 根据描述补全未展示的身体、服装与背面',
                  'I allow AI to complete the unseen body, clothing, and back view',
                )}
                onChange={setAcceptedFaceCompletion}
                disabled={workflow.isSubmissionUncertain}
              />
              {workflow.bootstrap ? (
                <View
                  style={[
                    localStyles.costSummary,
                    { backgroundColor: colors.soft },
                  ]}
                  testID="avatar3d-reference-cost"
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
                        '本次先生成 4 张参考图',
                        'Generate four reference views first',
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
                        '确认效果后才会开始 3D 建模',
                        '3D modeling starts only after your review',
                      )}
                    </Text>
                  </View>
                  <Text
                    style={[
                      localStyles.costSummaryValue,
                      { color: colors.accent },
                    ]}
                  >
                    {textFor(language, '预计 ', 'Est. ')}
                    {formatCost(
                      workflow.bootstrap.feature
                        .referenceGenerationEstimatedCostFen,
                    )}
                  </Text>
                </View>
              ) : null}
            </Section>

            {workflow.errorMessage ? (
              <ErrorNotice colors={colors} message={workflow.errorMessage} />
            ) : null}
          </ScrollView>
          <View
            style={[
              localStyles.footer,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              disabled={
                isBusy ||
                (!workflow.validatedPhoto && !media) ||
                (Boolean(workflow.validatedPhoto) &&
                  !canGenerate &&
                  !workflow.isSubmissionUncertain)
              }
              onPress={() => submitComposer().catch(() => undefined)}
              style={({ pressed }) => [
                localStyles.primaryButton,
                { backgroundColor: colors.accent },
                pressed && localStyles.buttonPressed,
                (isBusy ||
                  (!workflow.validatedPhoto && !media) ||
                  (Boolean(workflow.validatedPhoto) &&
                    !canGenerate &&
                    !workflow.isSubmissionUncertain)) &&
                  localStyles.buttonDisabled,
              ]}
              testID="avatar3d-submit"
            >
              {isBusy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : null}
              <Text style={localStyles.primaryButtonText}>
                {workflow.busyAction === 'validating'
                  ? textFor(language, '正在检查照片', 'Checking Photo')
                  : workflow.busyAction === 'creating'
                  ? textFor(language, '正在提交', 'Submitting')
                  : workflow.isSubmissionUncertain
                  ? textFor(language, '重试原提交', 'Retry Submission')
                  : workflow.validatedPhoto
                  ? textFor(language, '生成四视图', 'Generate Four Views')
                  : textFor(language, '检查照片', 'Check Photo')}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <ModelManager
          colors={colors}
          isBusy={isBusy}
          language={language}
          models={workflow.bootstrap?.models || []}
          quota={workflow.bootstrap?.quota}
          token={token}
          onCreate={() => setShowComposer(true)}
          onDelete={model => {
            Alert.alert(
              textFor(language, '删除3D形象', 'Delete 3D Avatar'),
              textFor(
                language,
                '模型文件将被永久删除，是否继续？',
                'The model file will be permanently deleted.',
              ),
              [
                { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
                {
                  text: textFor(language, '删除', 'Delete'),
                  style: 'destructive',
                  onPress: () =>
                    workflow.deleteModel(model.id).catch(() => undefined),
                },
              ],
            );
          }}
          errorMessage={workflow.errorMessage}
        />
      )}
    </View>
  );
}

function Section({
  colors,
  title,
  children,
}: {
  colors: ScreenColors;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        localStyles.section,
        { backgroundColor: colors.surface, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[localStyles.sectionTitle, { color: colors.text }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function OptionRow<T extends string>({
  colors,
  disabled = false,
  options,
  value,
  onChange,
  wrap = false,
}: {
  colors: ScreenColors;
  disabled?: boolean;
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (next: T) => void;
  wrap?: boolean;
}) {
  return (
    <View style={[localStyles.optionRow, wrap && localStyles.optionRowWrap]}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            disabled={disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              localStyles.optionButton,
              wrap && localStyles.optionButtonWrap,
              {
                backgroundColor: selected ? colors.accent : colors.soft,
                borderColor: selected ? colors.accent : colors.border,
              },
            ]}
          >
            <Text
              style={[
                localStyles.optionText,
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
  );
}

function ConsentRow({
  checked,
  colors,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  colors: ScreenColors;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={localStyles.consentRow}
    >
      <View
        style={[
          localStyles.checkbox,
          {
            backgroundColor: checked ? colors.accent : colors.surface,
            borderColor: checked ? colors.accent : colors.border,
          },
        ]}
      >
        {checked ? <Check color="#FFFFFF" size={14} strokeWidth={3} /> : null}
      </View>
      <Text style={[localStyles.consentText, { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function JobView({
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
          <ErrorNotice colors={colors} message={workflow.errorMessage} />
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

function ModelManager({
  colors,
  errorMessage,
  isBusy,
  language,
  models,
  quota,
  token,
  onCreate,
  onDelete,
}: {
  colors: ScreenColors;
  errorMessage: string;
  isBusy: boolean;
  language: Language;
  models: Avatar3DModelDTO[];
  quota?: Avatar3DBootstrapDTO['quota'];
  token: string;
  onCreate: () => void;
  onDelete: (model: Avatar3DModelDTO) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={localStyles.managerContent}
      style={localStyles.bodyScroll}
      testID="avatar3d-manager-scroll"
    >
      <View
        style={[
          localStyles.managerSummary,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <View
          style={[localStyles.managerIcon, { backgroundColor: colors.soft }]}
        >
          <Cuboid color={colors.accent} size={32} strokeWidth={1.8} />
        </View>
        <View style={localStyles.managerSummaryCopy}>
          <Text style={[localStyles.managerTitle, { color: colors.text }]}>
            {textFor(
              language,
              `${models.length} 个3D形象`,
              `${models.length} 3D avatars`,
            )}
          </Text>
          <Text style={[localStyles.managerSubtitle, { color: colors.muted }]}>
            {quota
              ? textFor(
                  language,
                  `今日还可生成 ${quota.dailyRemaining} 次`,
                  `${quota.dailyRemaining} generations remaining today`,
                )
              : ''}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={textFor(language, '创建新形象', 'Create Avatar')}
          accessibilityRole="button"
          onPress={onCreate}
          style={[
            localStyles.newModelButton,
            { backgroundColor: colors.accent },
          ]}
        >
          <ImagePlus color="#FFFFFF" size={19} />
        </Pressable>
      </View>

      {models.length ? (
        <View
          style={[localStyles.modelList, { backgroundColor: colors.surface }]}
        >
          {models.map((model, index) => (
            <View
              key={model.id}
              style={[
                localStyles.modelRow,
                index < models.length - 1 && {
                  borderBottomColor: colors.border,
                },
                index < models.length - 1 && localStyles.modelRowDivider,
              ]}
            >
              <View
                style={[
                  localStyles.modelThumbnail,
                  { backgroundColor: colors.soft },
                ]}
              >
                {model.thumbnailAvailable ? (
                  <Image
                    resizeMode="cover"
                    source={{
                      headers: { Authorization: `Bearer ${token}` },
                      uri: avatar3dModelThumbnailUrl(model.id),
                    }}
                    style={localStyles.modelThumbnailImage}
                  />
                ) : (
                  <Cuboid color={colors.muted} size={24} strokeWidth={1.6} />
                )}
              </View>
              <View style={localStyles.modelCopy}>
                <Text
                  numberOfLines={1}
                  style={[localStyles.modelTitle, { color: colors.text }]}
                >
                  {model.title}
                </Text>
                <Text style={[localStyles.modelMeta, { color: colors.muted }]}>
                  {new Date(model.createdAt).toLocaleDateString(
                    language === 'zh' ? 'zh-CN' : 'en-US',
                  )}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={textFor(
                  language,
                  '删除形象',
                  'Delete Avatar',
                )}
                accessibilityRole="button"
                disabled={isBusy}
                hitSlop={8}
                onPress={() => onDelete(model)}
                style={localStyles.deleteButton}
              >
                {isBusy ? (
                  <ActivityIndicator color={colors.muted} size="small" />
                ) : (
                  <Trash2 color={colors.danger} size={20} strokeWidth={1.8} />
                )}
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={localStyles.managerEmpty}>
          <Cuboid color={colors.muted} size={40} strokeWidth={1.5} />
          <Text style={[localStyles.managerEmptyTitle, { color: colors.text }]}>
            {textFor(language, '还没有3D形象', 'No 3D avatar yet')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onCreate}
            style={localStyles.inlineCommand}
          >
            <Text
              style={[localStyles.inlineCommandText, { color: colors.accent }]}
            >
              {textFor(language, '创建第一个形象', 'Create Your First Avatar')}
            </Text>
          </Pressable>
        </View>
      )}

      {errorMessage ? (
        <ErrorNotice colors={colors} message={errorMessage} />
      ) : null}
    </ScrollView>
  );
}

function ErrorNotice({
  colors,
  message,
}: {
  colors: ScreenColors;
  message: string;
}) {
  return (
    <View
      style={[
        localStyles.errorNotice,
        {
          backgroundColor: `${colors.danger}12`,
          borderColor: `${colors.danger}33`,
        },
      ]}
    >
      <AlertCircle color={colors.danger} size={18} />
      <Text style={[localStyles.errorText, { color: colors.danger }]}>
        {message}
      </Text>
    </View>
  );
}

function jobStatusCopy(language: Language, job: Avatar3DJobDTO) {
  const map: Record<
    Avatar3DJobDTO['status'],
    { zh: string; en: string; zhBody: string; enBody: string }
  > = {
    queued_references: {
      zh: '正在准备参考视图',
      en: 'Preparing References',
      zhBody: '任务已进入队列。',
      enBody: 'Your task is queued.',
    },
    submitting_references: {
      zh: '正在提交参考视图',
      en: 'Submitting References',
      zhBody: '正在连接图像生成服务。',
      enBody: 'Connecting to the image service.',
    },
    processing_references: {
      zh: '正在生成四视图',
      en: 'Generating Four Views',
      zhBody: '生成完成后需要你确认人物外观。',
      enBody: 'You will review the appearance next.',
    },
    persisting_references: {
      zh: '正在保存参考视图',
      en: 'Saving References',
      zhBody: '正在安全保存四个视角。',
      enBody: 'Saving all four views securely.',
    },
    awaiting_reference_confirmation: {
      zh: '参考视图已生成',
      en: 'References Ready',
      zhBody: '确认后才会开始3D建模。',
      enBody: '3D modeling starts after confirmation.',
    },
    queued_3d: {
      zh: '3D建模已排队',
      en: '3D Modeling Queued',
      zhBody: '模型任务即将开始。',
      enBody: 'Model generation will start shortly.',
    },
    submitting_3d: {
      zh: '正在提交3D建模',
      en: 'Submitting 3D Model',
      zhBody: '正在连接3D建模服务。',
      enBody: 'Connecting to the 3D service.',
    },
    processing_3d: {
      zh: '正在生成3D模型',
      en: 'Generating 3D Model',
      zhBody: '可以离开此页面，任务会在后台继续。',
      enBody: 'You can leave while the task continues.',
    },
    persisting: {
      zh: '正在保存模型',
      en: 'Saving Model',
      zhBody: '模型即将出现在“我的模样”。',
      enBody: 'Your model will appear in My Look shortly.',
    },
    succeeded: {
      zh: '3D形象已生成',
      en: '3D Avatar Ready',
      zhBody: '模型已经保存到“我的模样”。',
      enBody: 'The model is now available in My Look.',
    },
    failed: {
      zh: '生成失败',
      en: 'Generation Failed',
      zhBody: job.errorCode ? `错误代码：${job.errorCode}` : '任务未能完成。',
      enBody: job.errorCode
        ? `Error: ${job.errorCode}`
        : 'The task could not be completed.',
    },
    quality_failed: {
      zh: '模型质量未通过',
      en: 'Quality Check Failed',
      zhBody: '本次结果未达到保存标准。',
      enBody: 'The result did not meet the save threshold.',
    },
    cancelled: {
      zh: '任务已取消',
      en: 'Task Cancelled',
      zhBody: '本次任务没有生成模型。',
      enBody: 'No model was created for this task.',
    },
    submission_unknown: {
      zh: '提交状态无法确认',
      en: 'Submission Unconfirmed',
      zhBody: '为避免重复生成，系统已停止本次任务。',
      enBody: 'The task stopped to prevent duplicate generation.',
    },
  };
  const copy = map[job.status];
  return {
    body: language === 'zh' ? copy.zhBody : copy.enBody,
    title: language === 'zh' ? copy.zh : copy.en,
  };
}

function referenceViewLabel(
  language: Language,
  view: 'front' | 'left' | 'back' | 'right',
) {
  const labels = {
    front: textFor(language, '正面', 'Front'),
    left: textFor(language, '左侧', 'Left'),
    back: textFor(language, '背面', 'Back'),
    right: textFor(language, '右侧', 'Right'),
  };
  return labels[view];
}

type ScreenColors = {
  accent: string;
  background: string;
  border: string;
  danger: string;
  muted: string;
  soft: string;
  surface: string;
  text: string;
};

const localStyles = StyleSheet.create({
  screen: { flex: 1 },
  bodyScroll: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: 2,
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: 12,
  },
  headerButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backIcon: { height: 22, width: 22 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  composerContent: { paddingBottom: 12 },
  section: {
    borderBottomWidth: 2,
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  photoPicker: {
    aspectRatio: 1.6,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoPreview: { height: '100%', width: '100%' },
  photoPlaceholder: {
    alignItems: 'center',
    flex: 1,
    gap: 7,
    justifyContent: 'center',
    padding: 20,
  },
  photoPickerTitle: { fontSize: 15, fontWeight: '700' },
  photoPickerHint: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  inlineCommand: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 6,
    minHeight: 30,
  },
  inlineCommandText: { fontSize: 13, fontWeight: '700' },
  validationResult: {
    alignItems: 'flex-start',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  validationCopy: { flex: 1, gap: 4 },
  validationTitle: { fontSize: 13, fontWeight: '700' },
  validationAdvice: { fontSize: 12, lineHeight: 18 },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionRowWrap: { flexWrap: 'wrap' },
  optionButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 8,
  },
  optionButtonWrap: { flexBasis: '30%', flexGrow: 1 },
  optionText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  optionTextSelected: { color: '#FFFFFF' },
  descriptionInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 92,
    padding: 12,
    textAlignVertical: 'top',
  },
  characterCount: { alignSelf: 'flex-end', fontSize: 11 },
  consentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 36,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  consentText: { flex: 1, fontSize: 13, lineHeight: 19 },
  costSummary: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  costSummaryCopy: { flex: 1, gap: 3 },
  costSummaryTitle: { fontSize: 13, fontWeight: '700', lineHeight: 19 },
  costSummaryHint: { fontSize: 11, lineHeight: 17 },
  costSummaryValue: { fontSize: 14, fontWeight: '700' },
  footer: { borderTopWidth: 2, paddingHorizontal: 18, paddingVertical: 12 },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  buttonDisabled: { opacity: 0.42 },
  buttonPressed: { opacity: 0.82 },
  errorNotice: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    margin: 16,
    padding: 12,
  },
  errorText: { flex: 1, fontSize: 12, lineHeight: 18 },
  jobContent: { paddingBottom: 24 },
  progressSection: {
    alignItems: 'center',
    borderBottomWidth: 2,
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  jobIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 60,
    justifyContent: 'center',
    marginBottom: 18,
    width: 60,
  },
  jobTitle: { fontSize: 21, fontWeight: '700', textAlign: 'center' },
  jobBody: { fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  progressTrack: {
    borderRadius: 4,
    height: 8,
    marginTop: 24,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: { borderRadius: 4, height: '100%' },
  progressValue: { fontSize: 12, marginTop: 8 },
  referenceSection: { borderBottomWidth: 2, padding: 18 },
  referenceTitle: { fontSize: 17, fontWeight: '700' },
  referenceHint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  referenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  referenceItem: {
    aspectRatio: 0.82,
    borderRadius: 8,
    flexBasis: '48%',
    flexGrow: 1,
    overflow: 'hidden',
  },
  referenceImage: { height: '100%', width: '100%' },
  referenceLabel: {
    backgroundColor: 'rgba(0,0,0,0.66)',
    bottom: 0,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    left: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    right: 0,
  },
  referenceLoading: {
    alignItems: 'center',
    height: 220,
    justifyContent: 'center',
  },
  referenceQuality: {
    borderTopWidth: 2,
    gap: 10,
    marginTop: 18,
    paddingTop: 18,
  },
  referenceQualityTitle: { fontSize: 16, fontWeight: '700' },
  referenceQualityHint: { fontSize: 12, lineHeight: 18, minHeight: 18 },
  qualitySegment: { flexDirection: 'row', gap: 8 },
  qualitySegmentButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 10,
  },
  qualitySegmentLabel: { fontSize: 13, fontWeight: '700' },
  referenceActions: { flexDirection: 'row', gap: 10 },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  referencePrimaryButton: { flex: 1 },
  cancelCommand: {
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 16,
    padding: 12,
  },
  cancelCommandText: { fontSize: 13, fontWeight: '700' },
  managerContent: { paddingBottom: 20 },
  managerSummary: {
    alignItems: 'center',
    borderBottomWidth: 2,
    flexDirection: 'row',
    gap: 12,
    padding: 18,
  },
  managerIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  managerSummaryCopy: { flex: 1, gap: 4 },
  managerTitle: { fontSize: 18, fontWeight: '700' },
  managerSubtitle: { fontSize: 12 },
  newModelButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  modelList: { marginTop: 10 },
  modelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 18,
    minHeight: 86,
    paddingVertical: 12,
  },
  modelRowDivider: { borderBottomWidth: 2 },
  modelThumbnail: {
    alignItems: 'center',
    borderRadius: 8,
    height: 62,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 62,
  },
  modelThumbnailImage: { height: '100%', width: '100%' },
  modelCopy: { flex: 1, gap: 5 },
  modelTitle: { fontSize: 15, fontWeight: '700' },
  modelMeta: { fontSize: 12 },
  deleteButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  managerEmpty: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 30,
    paddingTop: 100,
  },
  managerEmptyTitle: { fontSize: 17, fontWeight: '700' },
});
