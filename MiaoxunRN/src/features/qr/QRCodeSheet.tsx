import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {ChevronDown, QrCode, RefreshCw} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';

import {textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {Language} from '../session/useMiaoxunSession';

const qrDiyPalettes = [
  {paper: '#fff7df', ink: '#17302a', tape: '#ffcf5a', accent: '#e94b5f', stamp: '#52b788'},
  {paper: '#f3fbff', ink: '#1b2945', tape: '#8bd3ff', accent: '#f08a5d', stamp: '#7c5cff'},
  {paper: '#fff1f4', ink: '#2d1d28', tape: '#ff9ab3', accent: '#3fbf9f', stamp: '#f6b73c'},
  {paper: '#f7f3e8', ink: '#1f2b21', tape: '#b8df88', accent: '#4d96ff', stamp: '#ff7a59'},
  {paper: '#f4efff', ink: '#241d38', tape: '#c7a7ff', accent: '#ffbe3d', stamp: '#30bced'},
] as const;

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 131 + value.charCodeAt(index)) % 1000000007;
  }
  return hash;
};

const qrDiyStyleFor = (value: string) => {
  const hash = hashString(value || 'miaoxun');
  const styleMatch = value.match(/[?&]s=(\d)/);
  const styleIndex = styleMatch ? Number(styleMatch[1]) : Math.floor(hash / 997);
  return {
    palette: qrDiyPalettes[hash % qrDiyPalettes.length],
    rotate: `${(Math.floor(hash / 7) % 5) - 2}deg`,
    tapeRotate: `${(Math.floor(hash / 31) % 9) - 4}deg`,
    stampX: 24 + (Math.floor(hash / 97) % 34),
    stampY: 22 + (Math.floor(hash / 193) % 26),
    cornerSize: 18 + (Math.floor(hash / 389) % 10),
    styleIndex,
  };
};

export function QRCodeSheet({
  palette,
  language,
  aiId,
  payload,
  onBack,
}: {
  palette: Palette;
  language: Language;
  aiId: string;
  payload: string;
  onBack: () => void;
}) {
  const [expiresAt, setExpiresAt] = useState(Date.now() + 120000);
  const [now, setNow] = useState(Date.now());
  const [codePayload, setCodePayload] = useState(payload);
  const [styleStep, setStyleStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setCodePayload(payload);
    setExpiresAt(Date.now() + 120000);
    setStyleStep(hashString(payload || aiId) % 4);
  }, [aiId, payload]);

  const refresh = () => {
    const nextExpiry = Date.now() + 120000;
    const nextStyleStep = (styleStep + 1) % 4;
    setStyleStep(nextStyleStep);
    setExpiresAt(nextExpiry);
    setCodePayload(`miaoxun://ai/${aiId}?e=${Math.floor(nextExpiry / 1000)}&s=${nextStyleStep}&n=${Math.random().toString(36).slice(2, 10)}`);
  };

  const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const remainingText = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const qrDiyStyle = useMemo(() => qrDiyStyleFor(codePayload || aiId), [aiId, codePayload]);

  return (
    <>
      <Pressable style={styles.qrSheetBackdrop} onPress={onBack} />
      <View style={[styles.qrScreen, {backgroundColor: palette.background, borderColor: palette.border}]}>
        <View style={styles.qrHeader}>
          <Pressable
            onPress={onBack}
            style={[styles.qrCircleButton, {backgroundColor: palette.surface, borderColor: palette.border}]}>
            <ChevronDown color={palette.mint} size={22} strokeWidth={3} />
          </Pressable>
          <Text style={[styles.qrTitle, {color: palette.text}]} numberOfLines={1}>
            {textFor(language, 'AI ID 动态码', 'AI ID Dynamic Code')}
          </Text>
          <View style={[styles.qrTimer, {backgroundColor: `${palette.mint}1f`, borderColor: `${palette.mint}38`}]}>
            <Text style={[styles.qrTimerText, {color: palette.mint}]}>{remainingText}</Text>
          </View>
          <Pressable
            onPress={refresh}
            style={[styles.qrRefreshButton, {backgroundColor: palette.surface, borderColor: palette.border}]}>
            <RefreshCw color={palette.text} size={17} strokeWidth={2.6} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.qrContent}>
          <View style={[styles.qrDiyFrame, {shadowColor: palette.shadow, transform: [{rotate: qrDiyStyle.rotate}]}]}>
            <View
              style={[
                styles.qrTape,
                {
                  backgroundColor: qrDiyStyle.palette.tape,
                  transform: [{rotate: qrDiyStyle.tapeRotate}],
                },
              ]}
            />
            <View
              style={[
                styles.qrDiyCard,
                {
                  backgroundColor: qrDiyStyle.palette.paper,
                  borderColor: qrDiyStyle.palette.ink,
                },
              ]}>
              <View
                style={[
                  styles.qrCornerMark,
                  {
                    borderColor: qrDiyStyle.palette.accent,
                    height: qrDiyStyle.cornerSize,
                    width: qrDiyStyle.cornerSize,
                  },
                ]}
              />
              <View
                style={[
                  styles.qrStamp,
                  {
                    backgroundColor: qrDiyStyle.palette.stamp,
                    left: qrDiyStyle.stampX,
                    top: qrDiyStyle.stampY,
                  },
                ]}
              />
              <View style={[styles.qrInnerPatch, {backgroundColor: qrDiyStyle.palette.paper}]}>
                <HandmadeQRCode
                  value={codePayload || aiId}
                  size={178}
                  ink={qrDiyStyle.palette.ink}
                  paper={qrDiyStyle.palette.paper}
                />
              </View>
              <Text style={[styles.qrHandMark, {color: qrDiyStyle.palette.accent}]}>MIAO</Text>
            </View>
          </View>
          <View style={[styles.qrAiIdPill, {backgroundColor: palette.surface, borderColor: palette.border}]}>
            <QrCode color={palette.mint} size={16} strokeWidth={2.6} />
            <Text style={[styles.qrAiIdText, {color: palette.text}]}>AI ID {aiId}</Text>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

function HandmadeQRCode({
  value,
  size,
  paper,
  ink,
}: {
  value: string;
  size: number;
  paper: string;
  ink: string;
}) {
  return (
    <QRCode
      value={value || 'miaoxun'}
      size={size}
      color={ink}
      backgroundColor={paper}
      ecl="H"
      quietZone={8}
    />
  );
}
