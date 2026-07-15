import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  Undo2,
  Save,
  Send,
  Sparkles,
} from 'lucide-react-native';

import {
  HomepageDraftContentDTO,
  HomepageSectionDTO,
  HomepageSiteDraftDTO,
} from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { homepageStyles } from './homepageStyles';

const isConflict = (error: unknown) =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 409,
  );

const sectionName = (language: Language, section: HomepageSectionDTO) => {
  const names: Record<HomepageSectionDTO['type'], [string, string]> = {
    hero: ['封面', 'Cover'],
    about: ['关于我', 'About'],
    gallery: ['照片', 'Photos'],
    diary: ['日记', 'Diary'],
    contact: ['联系', 'Contact'],
  };
  const [zh, en] = names[section.type];
  return textFor(language, zh, en);
};

export function HomepageEditor({
  palette,
  language,
  token,
  siteDraft,
  onBack,
  onSave,
  onReload,
  onRefine,
  onPreview,
  onPublish,
}: {
  palette: Palette;
  language: Language;
  token: string;
  siteDraft: HomepageSiteDraftDTO;
  onBack: () => void;
  onSave: (draft: HomepageDraftContentDTO) => Promise<HomepageSiteDraftDTO>;
  onReload: () => Promise<HomepageSiteDraftDTO>;
  onRefine: (
    sectionId: string,
    instruction: string,
  ) => Promise<HomepageSiteDraftDTO>;
  onPreview: () => Promise<void>;
  onPublish: () => void;
}) {
  const [workingDraft, setWorkingDraft] = useState(siteDraft.draft);
  const [history, setHistory] = useState<HomepageDraftContentDTO[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(
    siteDraft.draft.sections[0]?.id || '',
  );
  const [instruction, setInstruction] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasConflict, setHasConflict] = useState(false);

  useEffect(() => {
    setWorkingDraft(siteDraft.draft);
    setHistory([]);
    setSelectedSectionId(current =>
      siteDraft.draft.sections.some(section => section.id === current)
        ? current
        : siteDraft.draft.sections[0]?.id || '',
    );
  }, [siteDraft]);

  const selectedSection = workingDraft.sections.find(
    section => section.id === selectedSectionId,
  );
  const isDirty = useMemo(
    () => JSON.stringify(workingDraft) !== JSON.stringify(siteDraft.draft),
    [siteDraft.draft, workingDraft],
  );
  const publishColor = isDirty ? palette.secondaryText : '#ffffff';

  const changeDraft = (
    update: (current: HomepageDraftContentDTO) => HomepageDraftContentDTO,
  ) => {
    setWorkingDraft(current => {
      const next = update(current);
      if (next !== current) {
        setHistory(items => [...items.slice(-19), current]);
      }
      return next;
    });
    setErrorMessage('');
    setHasConflict(false);
  };

  const updateSection = (
    sectionId: string,
    update: (section: HomepageSectionDTO) => HomepageSectionDTO,
  ) => {
    changeDraft(current => ({
      ...current,
      sections: current.sections.map(section =>
        section.id === sectionId ? update(section) : section,
      ),
    }));
  };

  const moveSection = (direction: -1 | 1) => {
    if (!selectedSection) {
      return;
    }
    changeDraft(current => {
      const index = current.sections.findIndex(
        section => section.id === selectedSection.id,
      );
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.sections.length) {
        return current;
      }
      const sections = [...current.sections];
      const [moved] = sections.splice(index, 1);
      sections.splice(nextIndex, 0, moved);
      return { ...current, sections };
    });
  };

  const setCover = (assetId: string) => {
    const hero = workingDraft.sections.find(section => section.type === 'hero');
    if (!hero) {
      return;
    }
    updateSection(hero.id, section => ({
      ...section,
      assetIds: [assetId, ...section.assetIds.filter(id => id !== assetId)],
    }));
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) {
      return;
    }
    setWorkingDraft(previous);
    setHistory(items => items.slice(0, -1));
    setErrorMessage('');
    setHasConflict(false);
  };

  const save = async () => {
    if (!isDirty || isSaving) {
      return;
    }
    setIsSaving(true);
    setErrorMessage('');
    setHasConflict(false);
    try {
      const updated = await onSave(workingDraft);
      setWorkingDraft(updated.draft);
      setHistory([]);
    } catch (error) {
      setHasConflict(isConflict(error));
      setErrorMessage(
        isConflict(error)
          ? textFor(
              language,
              '主页已在其他设备更新，请重新载入后再修改。',
              'Homepage changed on another device. Reload before editing.',
            )
          : textFor(
              language,
              '修改暂时没有保存，请重试。',
              'Changes were not saved. Try again.',
            ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const refine = async () => {
    if (!selectedSection || !instruction.trim() || isRefining || isDirty) {
      return;
    }
    setIsRefining(true);
    setErrorMessage('');
    setHasConflict(false);
    try {
      const updated = await onRefine(selectedSection.id, instruction.trim());
      setWorkingDraft(updated.draft);
      setInstruction('');
      setHistory([]);
    } catch (error) {
      setHasConflict(isConflict(error));
      setErrorMessage(
        isConflict(error)
          ? textFor(
              language,
              '主页已在其他设备更新，请重新载入后再修改。',
              'Homepage changed on another device. Reload before editing.',
            )
          : textFor(
              language,
              '这次调整没有完成，请稍后重试。',
              'This refinement did not finish. Try again later.',
            ),
      );
    } finally {
      setIsRefining(false);
    }
  };

  const preview = async () => {
    if (isDirty) {
      setHasConflict(false);
      setErrorMessage(
        textFor(
          language,
          '请先保存修改，再打开预览。',
          'Save changes before opening preview.',
        ),
      );
      return;
    }
    await onPreview();
  };

  const hero = workingDraft.sections.find(section => section.type === 'hero');

  return (
    <ScrollView
      style={[homepageStyles.screen, { backgroundColor: palette.background }]}
      contentContainerStyle={homepageStyles.content}
      keyboardShouldPersistTaps="handled"
    >
      {siteDraft.source === 'fallback' ? (
        <View
          style={[
            homepageStyles.statusBand,
            { backgroundColor: palette.soft, borderLeftColor: palette.sun },
          ]}
        >
          <Text style={[homepageStyles.statusText, { color: palette.text }]}>
            {textFor(
              language,
              '基础版已生成，可直接使用，也可以继续修改。',
              'A basic version is ready. Use it now or keep editing.',
            )}
          </Text>
        </View>
      ) : null}

      <Text
        style={[homepageStyles.overviewTitle, { color: palette.text }]}
        numberOfLines={2}
      >
        {workingDraft.title}
      </Text>

      <View style={homepageStyles.toolbar}>
        <Pressable
          onPress={onBack}
          style={[
            homepageStyles.outlineButton,
            { borderColor: palette.border },
          ]}
        >
          <Text style={[homepageStyles.outlineText, { color: palette.text }]}>
            {textFor(language, '返回', 'Back')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={textFor(language, '撤销', 'Undo')}
          accessibilityState={{ disabled: history.length === 0 }}
          disabled={history.length === 0}
          onPress={undo}
          style={[
            homepageStyles.smallIconButton,
            { borderColor: palette.border },
          ]}
        >
          <Undo2
            color={history.length ? palette.text : palette.secondaryText}
            size={18}
            strokeWidth={2.3}
          />
        </Pressable>
        <Pressable
          testID="homepage-save"
          accessibilityState={{ disabled: !isDirty || isSaving }}
          disabled={!isDirty || isSaving}
          onPress={() => save().catch(() => undefined)}
          style={[
            homepageStyles.outlineButton,
            { borderColor: palette.border },
          ]}
        >
          <Save color={palette.text} size={17} strokeWidth={2.3} />
          <Text style={[homepageStyles.outlineText, { color: palette.text }]}>
            {isSaving
              ? textFor(language, '保存中', 'Saving')
              : textFor(language, '保存', 'Save')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={textFor(language, '预览', 'Preview')}
          onPress={() => preview().catch(() => undefined)}
          style={[
            homepageStyles.smallIconButton,
            { borderColor: palette.border },
          ]}
        >
          <Eye color={palette.text} size={18} strokeWidth={2.3} />
        </Pressable>
        <Pressable
          testID="homepage-publish"
          accessibilityState={{ disabled: isDirty }}
          disabled={isDirty}
          onPress={onPublish}
          style={[
            homepageStyles.commandButton,
            { backgroundColor: isDirty ? palette.soft : palette.mint },
          ]}
        >
          <Send color={publishColor} size={17} strokeWidth={2.3} />
          <Text style={[homepageStyles.commandText, { color: publishColor }]}>
            {textFor(language, '发布', 'Publish')}
          </Text>
        </Pressable>
      </View>

      {errorMessage ? (
        <>
          <Text style={[homepageStyles.errorText, { color: palette.rose }]}>
            {errorMessage}
          </Text>
          {hasConflict ? (
            <Pressable
              testID="homepage-reload"
              onPress={() =>
                onReload()
                  .then(updated => {
                    setWorkingDraft(updated.draft);
                    setHistory([]);
                    setHasConflict(false);
                    setErrorMessage('');
                  })
                  .catch(() => undefined)
              }
              style={[
                homepageStyles.outlineButton,
                homepageStyles.marginTop10,
                { borderColor: palette.border },
              ]}
            >
              <Text
                style={[homepageStyles.outlineText, { color: palette.text }]}
              >
                {textFor(language, '重新载入', 'Reload')}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      <View
        style={[homepageStyles.section, { borderBottomColor: palette.border }]}
      >
        <Text style={[homepageStyles.sectionTitle, { color: palette.text }]}>
          {textFor(language, '主页标题', 'Homepage title')}
        </Text>
        <TextInput
          testID="homepage-title"
          value={workingDraft.title}
          maxLength={80}
          onChangeText={title =>
            changeDraft(current => ({ ...current, title }))
          }
          style={[
            homepageStyles.input,
            {
              color: palette.text,
              backgroundColor: palette.input,
              borderColor: palette.border,
            },
          ]}
        />
        <TextInput
          value={workingDraft.summary}
          maxLength={240}
          multiline
          onChangeText={summary =>
            changeDraft(current => ({ ...current, summary }))
          }
          placeholder={textFor(language, '主页摘要', 'Homepage summary')}
          placeholderTextColor={palette.secondaryText}
          style={[
            homepageStyles.input,
            homepageStyles.multilineInput,
            {
              color: palette.text,
              backgroundColor: palette.input,
              borderColor: palette.border,
            },
          ]}
        />
      </View>

      <View
        style={[homepageStyles.section, { borderBottomColor: palette.border }]}
      >
        <Text style={[homepageStyles.sectionTitle, { color: palette.text }]}>
          {textFor(language, '版式', 'Theme')}
        </Text>
        <View
          style={[homepageStyles.themeRow, { borderColor: palette.border }]}
        >
          {(['gallery', 'clean'] as const).map(theme => {
            const selected = workingDraft.theme === theme;
            return (
              <Pressable
                key={theme}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => changeDraft(current => ({ ...current, theme }))}
                style={[
                  homepageStyles.themeButton,
                  {
                    backgroundColor: selected ? palette.soft : palette.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    homepageStyles.outlineText,
                    { color: selected ? palette.mint : palette.text },
                  ]}
                >
                  {theme === 'gallery'
                    ? textFor(language, '画廊', 'Gallery')
                    : textFor(language, '简洁', 'Clean')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[homepageStyles.section, { borderBottomColor: palette.border }]}
      >
        <Text style={[homepageStyles.sectionTitle, { color: palette.text }]}>
          {textFor(language, '封面照片', 'Cover photo')}
        </Text>
        <View style={homepageStyles.photoGrid}>
          {siteDraft.selectedMediaAssetIds.map(assetId => {
            const selected = hero?.assetIds[0] === assetId;
            return (
              <Pressable
                key={assetId}
                testID={`homepage-cover-${assetId}`}
                onPress={() => setCover(assetId)}
                style={[
                  homepageStyles.photoButton,
                  { borderColor: selected ? palette.mint : palette.border },
                ]}
              >
                <Image
                  source={{
                    uri: buildStationMediaFileUrl(assetId),
                    headers: { Authorization: `Bearer ${token}` },
                  }}
                  style={homepageStyles.photo}
                />
                {selected ? (
                  <View style={homepageStyles.photoOverlay}>
                    <View
                      style={[
                        homepageStyles.photoCheck,
                        { backgroundColor: palette.mint },
                      ]}
                    >
                      <Check color="#ffffff" size={16} strokeWidth={3} />
                    </View>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[homepageStyles.section, { borderBottomColor: palette.border }]}
      >
        <Text style={[homepageStyles.sectionTitle, { color: palette.text }]}>
          {textFor(language, '页面模块', 'Sections')}
        </Text>
        <View style={homepageStyles.sectionSelector}>
          {workingDraft.sections.map(section => {
            const selected = section.id === selectedSectionId;
            return (
              <Pressable
                key={section.id}
                onPress={() => setSelectedSectionId(section.id)}
                style={[
                  homepageStyles.sectionButton,
                  {
                    borderColor: selected ? palette.mint : palette.border,
                    backgroundColor: selected ? palette.soft : palette.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    homepageStyles.outlineText,
                    { color: selected ? palette.mint : palette.text },
                  ]}
                >
                  {sectionName(language, section)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selectedSection ? (
          <>
            <View style={homepageStyles.sectionControlRow}>
              <View>
                <Text
                  style={[homepageStyles.outlineText, { color: palette.text }]}
                >
                  {textFor(language, '显示此模块', 'Show this section')}
                </Text>
              </View>
              <View style={homepageStyles.sectionControlActions}>
                <Switch
                  value={!selectedSection.hidden}
                  onValueChange={visible =>
                    updateSection(selectedSection.id, section => ({
                      ...section,
                      hidden: !visible,
                    }))
                  }
                  trackColor={{ false: palette.border, true: palette.mint }}
                />
                <Pressable
                  accessibilityLabel={textFor(
                    language,
                    '模块上移',
                    'Move section up',
                  )}
                  onPress={() => moveSection(-1)}
                  style={[
                    homepageStyles.smallIconButton,
                    { borderColor: palette.border },
                  ]}
                >
                  <ArrowUp color={palette.text} size={17} strokeWidth={2.3} />
                </Pressable>
                <Pressable
                  accessibilityLabel={textFor(
                    language,
                    '模块下移',
                    'Move section down',
                  )}
                  onPress={() => moveSection(1)}
                  style={[
                    homepageStyles.smallIconButton,
                    { borderColor: palette.border },
                  ]}
                >
                  <ArrowDown color={palette.text} size={17} strokeWidth={2.3} />
                </Pressable>
              </View>
            </View>
            <TextInput
              value={selectedSection.title}
              maxLength={80}
              onChangeText={title =>
                updateSection(selectedSection.id, section => ({
                  ...section,
                  title,
                }))
              }
              style={[
                homepageStyles.input,
                {
                  color: palette.text,
                  backgroundColor: palette.input,
                  borderColor: palette.border,
                },
              ]}
            />
            <TextInput
              value={selectedSection.body}
              maxLength={900}
              multiline
              onChangeText={body =>
                updateSection(selectedSection.id, section => ({
                  ...section,
                  body,
                }))
              }
              placeholder={textFor(language, '模块正文', 'Section copy')}
              placeholderTextColor={palette.secondaryText}
              style={[
                homepageStyles.input,
                homepageStyles.multilineInput,
                {
                  color: palette.text,
                  backgroundColor: palette.input,
                  borderColor: palette.border,
                },
              ]}
            />
            {selectedSection.type === 'gallery' ? (
              <>
                <Text
                  style={[
                    homepageStyles.sectionHint,
                    homepageStyles.marginTop10,
                    { color: palette.secondaryText },
                  ]}
                >
                  {textFor(language, '本模块照片', 'Photos in this section')}
                </Text>
                <View style={homepageStyles.photoGrid}>
                  {siteDraft.selectedMediaAssetIds.map(assetId => {
                    const selected = selectedSection.assetIds.includes(assetId);
                    return (
                      <Pressable
                        key={assetId}
                        testID={`homepage-section-photo-${assetId}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() =>
                          updateSection(selectedSection.id, section => ({
                            ...section,
                            assetIds: selected
                              ? section.assetIds.filter(id => id !== assetId)
                              : [...section.assetIds, assetId],
                          }))
                        }
                        style={[
                          homepageStyles.photoButton,
                          {
                            borderColor: selected
                              ? palette.mint
                              : palette.border,
                          },
                        ]}
                      >
                        <Image
                          source={{
                            uri: buildStationMediaFileUrl(assetId),
                            headers: { Authorization: `Bearer ${token}` },
                          }}
                          style={homepageStyles.photo}
                        />
                        {selected ? (
                          <View style={homepageStyles.photoOverlay}>
                            <View
                              style={[
                                homepageStyles.photoCheck,
                                { backgroundColor: palette.mint },
                              ]}
                            >
                              <Check
                                color="#ffffff"
                                size={16}
                                strokeWidth={3}
                              />
                            </View>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
            <TextInput
              value={instruction}
              maxLength={600}
              onChangeText={setInstruction}
              placeholder={textFor(
                language,
                '例如：语气更简洁，保留照片顺序',
                'For example: make it concise and keep photo order',
              )}
              placeholderTextColor={palette.secondaryText}
              style={[
                homepageStyles.input,
                {
                  color: palette.text,
                  backgroundColor: palette.input,
                  borderColor: palette.border,
                },
              ]}
            />
            <Pressable
              accessibilityState={{
                disabled: !instruction.trim() || isRefining || isDirty,
              }}
              disabled={!instruction.trim() || isRefining || isDirty}
              onPress={() => refine().catch(() => undefined)}
              style={[
                homepageStyles.outlineButton,
                homepageStyles.marginTop10,
                { borderColor: palette.border },
              ]}
            >
              <Sparkles color={palette.text} size={17} strokeWidth={2.3} />
              <Text
                style={[homepageStyles.outlineText, { color: palette.text }]}
              >
                {isRefining
                  ? textFor(language, '调整中', 'Refining')
                  : textFor(
                      language,
                      '按这句话调整模块',
                      'Refine this section',
                    )}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}
