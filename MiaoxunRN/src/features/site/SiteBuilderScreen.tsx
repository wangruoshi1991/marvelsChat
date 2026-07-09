import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {Layers, Sparkles, WandSparkles} from 'lucide-react-native';

import {textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {Header, IconComponent} from '../../shared/ui';
import {Language} from '../session/useMiaoxunSession';

export function SiteBuilderScreen({
  palette,
  language,
  onBack,
}: {
  palette: Palette;
  language: Language;
  onBack: () => void;
}) {
  return (
    <ScrollView style={{backgroundColor: palette.background}} contentContainerStyle={styles.settingsContent}>
      <Header palette={palette} title="妙" onBack={onBack} />
      <View style={[styles.siteBuilderHero, {backgroundColor: palette.surface, borderColor: palette.border}]}>
        <View style={[styles.siteBuilderHeroIcon, {backgroundColor: `${palette.mint}24`}]}>
          <Sparkles color={palette.mint} size={30} strokeWidth={2.5} />
        </View>
        <Text style={[styles.siteBuilderTitle, {color: palette.text}]}>
          {textFor(language, '妙 · 建站入口', 'Miao Site Builder')}
        </Text>
        <Text style={[styles.siteBuilderBody, {color: palette.secondaryText}]}>
          {textFor(language, '这里会保留给后续 AI 建站与工具执行能力。当前先独立存在。', 'This entry is reserved for future AI site building and tool actions. It now stays separate from the Butler chat.')}
        </Text>
      </View>
      <View style={styles.siteBuilderCapabilities}>
        <SiteBuilderCapabilityRow
          icon={WandSparkles}
          palette={palette}
          title={textFor(language, '自然语言建站', 'Prompt-to-site')}
          subtitle={textFor(language, '后续从这里接入页面生成、模块装配和站点发布。', 'This will later host page generation, module assembly, and site publishing.')}
        />
        <SiteBuilderCapabilityRow
          icon={Layers}
          palette={palette}
          title={textFor(language, '工具动作', 'Tool actions')}
          subtitle={textFor(language, '后续接入站点素材、文件和多步骤任务执行。', 'This will later connect assets, files, and multi-step task execution.')}
        />
      </View>
    </ScrollView>
  );
}

function SiteBuilderCapabilityRow({
  icon: Icon,
  palette,
  title,
  subtitle,
}: {
  icon: IconComponent;
  palette: Palette;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={[styles.siteBuilderCapabilityRow, {backgroundColor: palette.surface, borderColor: palette.border}]}>
      <View style={[styles.siteBuilderCapabilityIcon, {backgroundColor: `${palette.mint}24`}]}>
        <Icon color={palette.mint} size={20} strokeWidth={2.4} />
      </View>
      <View style={styles.siteBuilderCapabilityCopy}>
        <Text style={[styles.siteBuilderCapabilityTitle, {color: palette.text}]}>
          {title}
        </Text>
        <Text style={[styles.siteBuilderCapabilitySubtitle, {color: palette.secondaryText}]}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
