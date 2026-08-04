import { Camera, Check, CheckCircle2, ImagePlus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { contactIconAssets } from '../../assets/icons';
import {
  Avatar3DBootstrapDTO,
  Avatar3DQualityPresetId,
} from '../../models/api';
import {
  PickedStationMedia,
  pickStationPhotoFromLibrary,
} from '../../services/stationMediaPicker';
import { textFor } from '../../shared/i18n';
import { Palette, palettes } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import {
  BodyShape,
  Outfit,
  ScreenColors,
  bodyShapeOptions,
  formatCost,
  outfitOptions,
} from './avatar3dCreatePresentation';
import { avatar3dCreateStyles as localStyles } from './avatar3dCreateStyles';
import { Avatar3DErrorNotice } from './Avatar3DCreateShared';
import { Avatar3DJobView } from './Avatar3DJobView';
import { Avatar3DModelManager } from './Avatar3DModelManager';
import { useAvatar3dWorkflow } from './useAvatar3dWorkflow';

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
        <Avatar3DJobView
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
              <Avatar3DErrorNotice
                colors={colors}
                message={workflow.errorMessage}
              />
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
        <Avatar3DModelManager
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
