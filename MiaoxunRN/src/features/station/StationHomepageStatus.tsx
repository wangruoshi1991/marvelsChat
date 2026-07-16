import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ChevronRight,
  Globe2,
  RefreshCw,
} from 'lucide-react-native';

import { HomepageSiteDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';

type LoadState = 'loading' | 'ready' | 'unavailable';

export function StationHomepageStatus({
  palette,
  language,
  enabled,
  refreshVersion,
  loadSite,
  onOpen,
}: {
  palette: Palette;
  language: Language;
  enabled: boolean;
  refreshVersion: number;
  loadSite: () => Promise<{ site: HomepageSiteDTO | null }>;
  onOpen: () => void;
}) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [site, setSite] = useState<HomepageSiteDTO | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestVersion.current;
    setLoadState('loading');
    try {
      const result = await loadSite();
      if (requestVersion.current !== requestId) {
        return;
      }
      setSite(result.site);
      setLoadState('ready');
    } catch {
      if (requestVersion.current !== requestId) {
        return;
      }
      setSite(null);
      setLoadState('unavailable');
    }
  }, [loadSite]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    load().catch(() => undefined);
    return () => {
      requestVersion.current += 1;
    };
  }, [enabled, load, refreshVersion]);

  if (!enabled) {
    return null;
  }

  if (loadState === 'unavailable') {
    return (
      <View
        testID="station-homepage-status"
        style={[
          localStyles.band,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <StatusIcon palette={palette} />
        <View style={localStyles.copy}>
          <Text style={[localStyles.title, { color: palette.text }]}>
            {textFor(language, '个人主页', 'Personal Homepage')}
          </Text>
          <Text
            style={[localStyles.detail, { color: palette.secondaryText }]}
            numberOfLines={2}
          >
            {textFor(
              language,
              '主页状态暂不可用',
              'Homepage status is unavailable',
            )}
          </Text>
        </View>
        <Pressable
          testID="station-homepage-retry"
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '重试', 'Retry')}
          hitSlop={8}
          onPress={() => load().catch(() => undefined)}
          style={[localStyles.iconButton, { backgroundColor: palette.soft }]}
        >
          <RefreshCw color={palette.text} size={18} strokeWidth={2.3} />
        </Pressable>
      </View>
    );
  }

  const status = homepageStatus(language, loadState, site);
  return (
    <Pressable
      testID="station-homepage-open"
      accessibilityRole="button"
      accessibilityLabel={status.action}
      disabled={loadState === 'loading'}
      onPress={onOpen}
      style={[
        localStyles.band,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <StatusIcon palette={palette} />
      <View style={localStyles.copy}>
        <Text style={[localStyles.title, { color: palette.text }]}>
          {textFor(language, '个人主页', 'Personal Homepage')}
        </Text>
        <Text
          style={[localStyles.detail, { color: palette.secondaryText }]}
          numberOfLines={2}
        >
          {status.label} · {status.action}
        </Text>
      </View>
      <View style={[localStyles.iconButton, { backgroundColor: palette.soft }]}>
        <ChevronRight color={palette.text} size={19} strokeWidth={2.3} />
      </View>
    </Pressable>
  );
}

function StatusIcon({ palette }: { palette: Palette }) {
  return (
    <View style={[localStyles.statusIcon, { backgroundColor: palette.soft }]}>
      <Globe2 color={palette.mint} size={22} strokeWidth={2.2} />
    </View>
  );
}

function homepageStatus(
  language: Language,
  loadState: LoadState,
  site: HomepageSiteDTO | null,
) {
  if (loadState === 'loading') {
    return {
      label: textFor(language, '正在同步', 'Syncing'),
      action: textFor(language, '请稍候', 'Please wait'),
    };
  }
  if (!site) {
    return {
      label: textFor(language, '未创建', 'Not created'),
      action: textFor(language, '用 AI 创建主页', 'Create with AI'),
    };
  }
  if (site.visibility === 'link' && site.publishedReleaseId) {
    return {
      label: textFor(language, '链接分享中', 'Link sharing active'),
      action: textFor(language, '查看与管理', 'View and manage'),
    };
  }
  if (site.publishedReleaseId) {
    return {
      label: textFor(language, '仅自己可见', 'Private'),
      action: textFor(language, '管理主页', 'Manage homepage'),
    };
  }
  return {
    label: textFor(language, '有未发布草稿', 'Unpublished draft'),
    action: textFor(language, '继续编辑', 'Continue editing'),
  };
}

const localStyles = StyleSheet.create({
  band: {
    minHeight: 76,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  detail: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
