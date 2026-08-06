import { Cuboid, ImagePlus, Trash2 } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { Avatar3DBootstrapDTO, Avatar3DModelDTO } from '../../models/api';
import { avatar3dModelThumbnailUrl } from '../../services/api/avatar3dApi';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/useMiaoxunSession';
import { ScreenColors } from './avatar3dCreatePresentation';
import { avatar3dCreateStyles as localStyles } from './avatar3dCreateStyles';
import { Avatar3DErrorNotice } from './Avatar3DCreateShared';

export function Avatar3DModelManager({
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
        <Avatar3DErrorNotice colors={colors} message={errorMessage} />
      ) : null}
    </ScrollView>
  );
}
