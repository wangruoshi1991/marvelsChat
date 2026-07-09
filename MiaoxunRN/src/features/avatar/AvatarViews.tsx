import React from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { AvatarConfigDTO } from '../../models/api';
import {
  avatarAccentColors,
  avatarBottomColors,
  avatarClothingColors,
  avatarHairColors,
  avatarShoeColors,
  avatarSkinColors,
} from './avatarConfig';
import { styles } from '../../shared/styles';

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 131 + value.charCodeAt(index)) % 1000000007;
  }
  return hash;
};

const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;

export function MiaoShowAvatar({
  config,
  rotation = 0,
  size = 300,
  previewMode = 'full',
}: {
  config: Required<AvatarConfigDTO>;
  rotation?: number;
  size?: number;
  previewMode?: 'face' | 'body' | 'full';
}) {
  const skin = avatarSkinColors[config.skinTone];
  const hair = avatarHairColors[config.hairColor];
  const accent = avatarAccentColors[config.accent];
  const clothes = avatarClothingColors[config.top];
  const pants = avatarBottomColors[config.bottom];
  const shoes = avatarShoeColors[config.shoes];
  const normalizedRotation = normalizeDegrees(rotation);
  const rotationRadians = (normalizedRotation * Math.PI) / 180;
  const turn = Math.sin(rotationRadians);
  const facing = turn >= 0 ? 1 : -1;
  const sideAmount = Math.abs(turn);
  const backAmount = Math.max(0, -Math.cos(rotationRadians));
  const isBackView = backAmount > 0.72;
  const isSideView = !isBackView && sideAmount > 0.68;
  const bodyScaleX =
    config.body === 'strong' ? 1.06 : config.body === 'compact' ? 0.94 : 1;
  const bodyScaleY =
    config.body === 'tall' ? 1.06 : config.body === 'compact' ? 0.96 : 1;
  const headScaleX =
    config.face === 'oval'
      ? 0.94
      : config.face === 'angular'
      ? 0.98
      : config.face === 'round'
      ? 1.05
      : 1;
  const eyeHeight =
    config.eyeStyle === 'calm'
      ? 5
      : config.eyeStyle === 'sharp'
      ? 7
      : config.eyeStyle === 'round'
      ? 11
      : 9;
  const eyeWidth =
    config.eyeStyle === 'round' ? 11 : config.eyeStyle === 'sharp' ? 15 : 13;
  const browTilt = config.browStyle === 'tilt' || config.eyeStyle === 'sharp';
  const action = config.action;
  const isCross = action === 'cross-arms';
  const isWave = action === 'wave';
  const isSoccer = action === 'soccer';
  const isQuestion = action === 'question';
  const isSit = action === 'sit';
  const bodyY = isSit ? 156 : 150;
  const gradientKey = Math.abs(
    hashString(
      `${config.seed}-${config.skinTone}-${config.hairColor}-${config.top}-${config.bottom}-${config.shoes}-${size}-${previewMode}`,
    ),
  );
  const skinGradientId = `skinGrad${gradientKey}`;
  const hairGradientId = `hairGrad${gradientKey}`;
  const clothingGradientId = `clothingGrad${gradientKey}`;
  const pantsGradientId = `pantsGrad${gradientKey}`;
  const shoeGradientId = `shoeGrad${gradientKey}`;
  const viewBox =
    previewMode === 'face'
      ? '48 22 144 150'
      : previewMode === 'body'
      ? '46 126 148 188'
      : '0 0 240 340';
  const mouthPath =
    config.mouthStyle === 'calm'
      ? 'M105 123 C113 126 127 126 135 123'
      : config.mouthStyle === 'confident'
      ? 'M106 119 C116 128 130 126 138 117'
      : config.mouthStyle === 'cute'
      ? 'M111 120 C116 132 128 132 133 120'
      : 'M105 120 C114 132 130 132 139 120';
  const hairPath =
    config.hairStyle === 'bob'
      ? 'M67 79 C70 35 102 22 132 28 C163 34 178 56 176 96 C172 81 161 73 151 72 C126 61 100 66 77 86 C73 96 70 105 66 116 C58 101 58 89 67 79 Z'
      : config.hairStyle === 'wave'
      ? 'M65 83 C73 39 117 21 152 37 C169 44 177 61 176 86 C160 74 145 78 130 62 C112 74 90 65 69 101 C61 95 59 89 65 83 Z'
      : config.hairStyle === 'curly'
      ? 'M64 88 C61 66 75 45 94 39 C98 24 120 23 127 35 C142 25 165 35 163 52 C181 60 181 87 169 98 C142 72 100 69 72 99 C69 95 66 92 64 88 Z'
      : config.hairStyle === 'undercut'
      ? 'M72 78 C82 39 122 24 162 42 C153 55 139 65 116 70 C96 74 82 86 70 104 C65 92 66 84 72 78 Z'
      : 'M67 84 C78 45 114 25 151 36 C170 42 179 59 176 84 C156 75 139 77 123 61 C105 75 87 72 69 103 C64 96 62 90 67 84 Z';
  const sceneDefs = (
    <Defs>
      <LinearGradient id="avatarGround" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
        <Stop offset="1" stopColor={accent.secondary} stopOpacity="0.16" />
      </LinearGradient>
      <LinearGradient id={skinGradientId} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#ffe7d6" stopOpacity="0.88" />
        <Stop offset="0.52" stopColor={skin.base} stopOpacity="1" />
        <Stop offset="1" stopColor={skin.shade} stopOpacity="1" />
      </LinearGradient>
      <LinearGradient id={hairGradientId} x1="0" y1="0" x2="0.9" y2="1">
        <Stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
        <Stop offset="0.36" stopColor={hair} stopOpacity="1" />
        <Stop offset="1" stopColor="#050505" stopOpacity="0.28" />
      </LinearGradient>
      <LinearGradient id={clothingGradientId} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={clothes.secondary} stopOpacity="0.95" />
        <Stop offset="0.34" stopColor={clothes.primary} stopOpacity="1" />
        <Stop offset="1" stopColor={clothes.line} stopOpacity="0.88" />
      </LinearGradient>
      <LinearGradient id={pantsGradientId} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={pants.secondary} stopOpacity="0.88" />
        <Stop offset="0.55" stopColor={pants.primary} stopOpacity="1" />
        <Stop offset="1" stopColor={pants.line} stopOpacity="0.72" />
      </LinearGradient>
      <LinearGradient id={shoeGradientId} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#ffffff" stopOpacity="0.86" />
        <Stop offset="0.45" stopColor={shoes.primary} stopOpacity="1" />
        <Stop offset="1" stopColor={shoes.sole} stopOpacity="0.92" />
      </LinearGradient>
    </Defs>
  );
  if (isBackView) {
    return (
      <View style={[styles.miaoShowAvatarWrap, { height: size, width: size }]}>
        <Svg
          width={size}
          height={size}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          {sceneDefs}
          <Ellipse cx="120" cy="309" rx="56" ry="13" fill="rgba(0,0,0,0.13)" />
          <G
            transform={`translate(${turn * 2} 2) scale(${
              bodyScaleX * 0.9
            } ${bodyScaleY})`}
          >
            <Path
              d="M82 214 C95 218 108 218 119 214 L116 289 C106 294 94 294 86 288 Z"
              fill={`url(#${pantsGradientId})`}
              stroke={pants.line}
              strokeWidth="3"
            />
            <Path
              d="M121 214 C134 218 146 218 158 214 L154 288 C146 294 134 294 124 289 Z"
              fill={`url(#${pantsGradientId})`}
              stroke={pants.line}
              strokeWidth="3"
            />
            <Path
              d="M78 289 C91 283 106 284 116 292 L112 302 L76 302 C68 299 70 293 78 289 Z"
              fill={`url(#${shoeGradientId})`}
              stroke={shoes.line}
              strokeWidth="3"
            />
            <Path
              d="M126 292 C137 284 154 283 166 289 C174 293 176 299 166 302 L130 302 Z"
              fill={`url(#${shoeGradientId})`}
              stroke={shoes.line}
              strokeWidth="3"
            />
            <Path
              d="M98 137 C96 148 96 153 99 159 L141 159 C144 153 144 148 142 137 Z"
              fill={skin.shade}
            />
            <Path
              d={`M75 ${bodyY} C91 135 149 135 165 ${bodyY} C174 178 170 207 158 226 C138 232 101 232 81 226 C70 207 67 178 75 ${bodyY} Z`}
              fill={`url(#${clothingGradientId})`}
              stroke={clothes.line}
              strokeWidth="3"
            />
            <Path
              d="M91 170 C105 161 135 161 149 170"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M89 205 C107 216 136 216 153 205"
              stroke="rgba(0,0,0,0.18)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M78 164 C61 184 58 203 66 224"
              stroke={clothes.primary}
              strokeWidth="17"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M164 164 C181 184 184 203 176 224"
              stroke={clothes.secondary}
              strokeWidth="17"
              strokeLinecap="round"
              fill="none"
            />
            <Circle cx="66" cy="224" r="11" fill={`url(#${skinGradientId})`} />
            <Circle cx="176" cy="224" r="11" fill={`url(#${skinGradientId})`} />
            <Path
              d="M65 87 C66 48 91 27 120 27 C149 27 174 48 175 87 C177 128 151 152 120 152 C89 152 63 128 65 87 Z"
              fill={`url(#${hairGradientId})`}
              stroke="#151515"
              strokeWidth="3"
            />
            <Path
              d="M79 73 C101 55 130 49 158 61"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <Path
              d="M83 103 C100 119 139 119 157 103"
              stroke="rgba(0,0,0,0.16)"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            {config.accessory === 'cap' ? (
              <Path
                d="M82 61 C95 36 145 36 159 61 C138 56 105 56 82 61 Z"
                fill={accent.detail}
                stroke="#151515"
                strokeWidth="3"
              />
            ) : null}
            {config.accessory === 'headphones' ? (
              <Path
                d="M78 91 C78 51 162 51 162 91"
                stroke={accent.detail}
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
              />
            ) : null}
          </G>
        </Svg>
      </View>
    );
  }
  if (isSideView) {
    const sideCenter = 120 + facing * 7;
    const earX = sideCenter - facing * 36;
    const noseX = sideCenter + facing * 36;
    const eyeX = sideCenter + facing * 16;
    return (
      <View style={[styles.miaoShowAvatarWrap, { height: size, width: size }]}>
        <Svg
          width={size}
          height={size}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
        >
          {sceneDefs}
          <Ellipse cx="120" cy="309" rx="48" ry="12" fill="rgba(0,0,0,0.13)" />
          <G
            transform={`translate(${turn * 10} 2) scale(${
              bodyScaleX * 0.72
            } ${bodyScaleY})`}
          >
            <Path
              d="M96 214 C108 218 132 218 145 214 L141 288 C129 294 111 294 99 288 Z"
              fill={`url(#${pantsGradientId})`}
              stroke={pants.line}
              strokeWidth="3"
            />
            <Path
              d="M91 290 C110 282 136 282 154 290 C162 295 160 301 151 303 L94 303 C84 300 84 295 91 290 Z"
              fill={`url(#${shoeGradientId})`}
              stroke={shoes.line}
              strokeWidth="3"
            />
            <Path
              d="M98 137 C96 148 97 153 101 159 L140 159 C143 153 144 148 142 137 Z"
              fill={skin.shade}
            />
            <Path
              d={`M83 ${bodyY} C95 136 145 136 158 ${bodyY} C166 179 163 207 153 225 C137 232 104 232 88 225 C77 207 74 179 83 ${bodyY} Z`}
              fill={`url(#${clothingGradientId})`}
              stroke={clothes.line}
              strokeWidth="3"
            />
            <Path
              d="M96 170 C108 181 133 181 145 170"
              stroke="rgba(255,255,255,0.23)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d={
                facing > 0
                  ? 'M155 164 C173 183 178 203 168 224'
                  : 'M85 164 C67 183 62 203 72 224'
              }
              stroke={clothes.secondary}
              strokeWidth="18"
              strokeLinecap="round"
              fill="none"
            />
            <Circle
              cx={facing > 0 ? 168 : 72}
              cy="224"
              r="11"
              fill={`url(#${skinGradientId})`}
            />
            <Circle
              cx={earX}
              cy="94"
              r="13"
              fill={`url(#${skinGradientId})`}
              stroke={skin.shade}
              strokeWidth="3"
            />
            <Path
              d={`M${sideCenter - facing * 34} 85 C${
                sideCenter - facing * 31
              } 48 ${sideCenter - facing * 10} 31 ${
                sideCenter + facing * 16
              } 35 C${sideCenter + facing * 44} 39 ${
                sideCenter + facing * 49
              } 65 ${sideCenter + facing * 38} 89 C${
                sideCenter + facing * 48
              } 111 ${sideCenter + facing * 33} 144 ${
                sideCenter + facing * 3
              } 150 C${sideCenter - facing * 25} 146 ${
                sideCenter - facing * 38
              } 120 ${sideCenter - facing * 34} 85 Z`}
              fill={`url(#${skinGradientId})`}
              stroke={skin.shade}
              strokeWidth="3"
            />
            <Path
              d={`M${noseX - facing * 4} 102 C${noseX + facing * 10} 108 ${
                noseX + facing * 9
              } 117 ${noseX - facing * 3} 118`}
              stroke={skin.shade}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <Ellipse
              cx={eyeX}
              cy="101"
              rx={eyeWidth * 0.72}
              ry={eyeHeight}
              fill="#2a211b"
            />
            {config.eyeStyle !== 'calm' ? (
              <Circle cx={eyeX - facing * 4} cy="97" r="3" fill="#ffffff" />
            ) : null}
            <Path
              d={`M${sideCenter + facing * 8} 121 C${
                sideCenter + facing * 18
              } 128 ${sideCenter + facing * 30} 124 ${
                sideCenter + facing * 34
              } 118`}
              stroke="#50342a"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d={`M${sideCenter - facing * 36} 82 C${
                sideCenter - facing * 18
              } 41 ${sideCenter + facing * 28} 26 ${
                sideCenter + facing * 50
              } 65 C${sideCenter + facing * 28} 58 ${
                sideCenter + facing * 10
              } 64 ${sideCenter - facing * 33} 104 Z`}
              fill={`url(#${hairGradientId})`}
              stroke="#151515"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <Path
              d={`M${sideCenter - facing * 8} 60 C${
                sideCenter + facing * 8
              } 50 ${sideCenter + facing * 23} 49 ${
                sideCenter + facing * 38
              } 58`}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="5"
              strokeLinecap="round"
            />
            {config.accessory === 'glasses' ? (
              <Path
                d={`M${eyeX - facing * 14} 100 C${eyeX - facing * 5} 94 ${
                  eyeX + facing * 12
                } 94 ${eyeX + facing * 16} 101`}
                stroke="#1f2937"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
            ) : null}
            {config.accessory === 'cap' ? (
              <Path
                d={`M${sideCenter - facing * 32} 61 C${
                  sideCenter - facing * 14
                } 36 ${sideCenter + facing * 29} 38 ${
                  sideCenter + facing * 43
                } 60 C${sideCenter + facing * 21} 56 ${
                  sideCenter - facing * 10
                } 56 ${sideCenter - facing * 32} 61 Z`}
                fill={accent.detail}
                stroke="#151515"
                strokeWidth="3"
              />
            ) : null}
          </G>
        </Svg>
      </View>
    );
  }
  return (
    <View style={[styles.miaoShowAvatarWrap, { height: size, width: size }]}>
      <Svg
        width={size}
        height={size}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {sceneDefs}
        <Ellipse cx="120" cy="309" rx="70" ry="14" fill="rgba(0,0,0,0.12)" />
        <G
          transform={`translate(${
            turn * 6
          } 2) scale(${bodyScaleX} ${bodyScaleY}) rotate(${turn * 6} 120 184)`}
        >
          {isSit ? (
            <G>
              <Path
                d="M84 231 C68 249 62 271 74 284 C90 282 106 267 116 247 Z"
                fill={`url(#${pantsGradientId})`}
                stroke={pants.line}
                strokeWidth="3"
              />
              <Path
                d="M124 247 C140 270 158 284 176 284 C186 269 170 248 151 231 Z"
                fill={`url(#${pantsGradientId})`}
                stroke={pants.line}
                strokeWidth="3"
              />
            </G>
          ) : (
            <G>
              <Path
                d="M83 214 C96 217 107 217 119 214 L116 288 C107 294 94 294 85 288 Z"
                fill={`url(#${pantsGradientId})`}
                stroke={pants.line}
                strokeWidth="3"
              />
              <Path
                d="M123 214 C135 218 147 218 158 214 L155 288 C146 294 133 294 124 288 Z"
                fill={`url(#${pantsGradientId})`}
                stroke={pants.line}
                strokeWidth="3"
              />
              <Path
                d="M100 221 C105 242 104 266 100 286"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <Path
                d="M141 221 C137 244 138 266 143 286"
                stroke="rgba(0,0,0,0.18)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {config.bottom === 'cargo' ? (
                <>
                  <Rect
                    x="91"
                    y="242"
                    width="18"
                    height="20"
                    rx="3"
                    fill="#b3a993"
                    stroke={pants.line}
                    strokeWidth="2"
                  />
                  <Rect
                    x="135"
                    y="240"
                    width="18"
                    height="20"
                    rx="3"
                    fill="#b3a993"
                    stroke={pants.line}
                    strokeWidth="2"
                  />
                </>
              ) : null}
            </G>
          )}
          <Path
            d="M73 288 C88 282 105 283 117 291 L113 302 L74 302 C67 299 68 293 73 288 Z"
            fill={`url(#${shoeGradientId})`}
            stroke={shoes.line}
            strokeWidth="3"
          />
          <Path
            d="M126 291 C139 283 157 282 171 288 C177 294 176 300 169 302 L130 302 Z"
            fill={`url(#${shoeGradientId})`}
            stroke={shoes.line}
            strokeWidth="3"
          />
          <Path
            d="M75 302 L113 302"
            stroke={shoes.sole}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <Path
            d="M130 302 L168 302"
            stroke={shoes.sole}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <Path
            d="M82 293 C93 289 105 290 114 294"
            stroke="rgba(255,255,255,0.72)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Path
            d="M136 294 C148 290 158 289 168 293"
            stroke="rgba(255,255,255,0.72)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Path
            d="M98 137 C96 147 96 151 98 158 L141 158 C144 151 144 146 142 137 Z"
            fill={skin.shade}
          />
          <Path
            d={`M75 ${bodyY} C90 135 150 135 166 ${bodyY} C174 176 169 206 158 225 C137 232 101 232 81 225 C70 206 67 176 75 ${bodyY} Z`}
            fill={`url(#${clothingGradientId})`}
            stroke={clothes.line}
            strokeWidth="3"
          />
          <Path
            d="M88 169 C99 184 135 187 153 170"
            stroke="rgba(255,255,255,0.26)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M88 205 C106 216 138 216 154 204"
            stroke="rgba(0,0,0,0.16)"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M101 161 C98 181 101 203 112 222"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <Path
            d="M93 151 C103 164 136 164 147 151 C143 169 97 169 93 151 Z"
            fill={skin.base}
            stroke={clothes.line}
            strokeWidth="2"
          />
          {config.top === 'uniform' ? (
            <>
              <Path
                d="M113 157 L127 157 L131 214 L119 224 L108 214 Z"
                fill={accent.secondary}
                stroke={clothes.line}
                strokeWidth="2"
              />
              <Path
                d="M91 153 L114 170 L104 184 L84 160 Z"
                fill={clothes.secondary}
              />
              <Path
                d="M148 153 L126 170 L136 184 L157 160 Z"
                fill={clothes.secondary}
              />
            </>
          ) : (
            <>
              <Path
                d="M87 162 C99 178 139 178 153 162"
                stroke={clothes.secondary}
                strokeWidth="7"
                strokeLinecap="round"
              />
              <Path
                d="M112 177 L128 177"
                stroke={accent.secondary}
                strokeWidth="6"
                strokeLinecap="round"
              />
            </>
          )}
          {isCross ? (
            <>
              <Path
                d="M75 168 C97 181 115 188 137 188"
                stroke={clothes.secondary}
                strokeWidth="17"
                strokeLinecap="round"
              />
              <Path
                d="M165 168 C143 181 125 188 103 188"
                stroke={clothes.primary}
                strokeWidth="17"
                strokeLinecap="round"
              />
              <Circle cx="100" cy="188" r="10" fill={skin.base} />
              <Circle cx="140" cy="188" r="10" fill={skin.base} />
            </>
          ) : (
            <>
              <Path
                d={
                  isWave
                    ? 'M78 164 C62 145 58 124 65 104'
                    : isSoccer
                    ? 'M78 164 C63 183 58 202 65 221'
                    : 'M78 164 C62 181 58 203 66 224'
                }
                stroke={clothes.primary}
                strokeWidth="17"
                strokeLinecap="round"
                fill="none"
              />
              <Path
                d={
                  isWave
                    ? 'M76 164 C64 146 62 128 68 111'
                    : isSoccer
                    ? 'M77 166 C66 184 63 201 68 217'
                    : 'M77 166 C66 184 63 203 68 220'
                }
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
              <Circle
                cx={isWave ? 65 : 66}
                cy={isWave ? 104 : isSoccer ? 221 : 224}
                r="11"
                fill={`url(#${skinGradientId})`}
              />
              <Path
                d={
                  isQuestion
                    ? 'M164 164 C181 141 188 125 183 104'
                    : 'M164 164 C181 183 185 203 176 224'
                }
                stroke={clothes.secondary}
                strokeWidth="17"
                strokeLinecap="round"
                fill="none"
              />
              <Path
                d={
                  isQuestion
                    ? 'M166 164 C180 143 184 126 181 111'
                    : 'M166 166 C180 184 182 203 174 220'
                }
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
              <Circle
                cx={isQuestion ? 183 : 176}
                cy={isQuestion ? 104 : 224}
                r="11"
                fill={`url(#${skinGradientId})`}
              />
            </>
          )}
          {isSoccer ? (
            <G>
              <Circle
                cx="58"
                cy="231"
                r="18"
                fill="#ffffff"
                stroke="#1f2937"
                strokeWidth="3"
              />
              <Path
                d="M58 216 L67 227 L63 241 L51 241 L47 227 Z"
                fill="#1f2937"
              />
            </G>
          ) : null}
          <G transform={`translate(0 ${config.body === 'compact' ? 6 : 0})`}>
            <Path
              d="M71 87 C61 78 49 86 51 101 C53 116 66 119 73 108 Z"
              fill={`url(#${skinGradientId})`}
              stroke={skin.shade}
              strokeWidth="3"
            />
            <Path
              d="M169 87 C179 78 191 86 189 101 C187 116 174 119 167 108 Z"
              fill={`url(#${skinGradientId})`}
              stroke={skin.shade}
              strokeWidth="3"
            />
            <G
              transform={`translate(120 89) scale(${headScaleX} 1) translate(-120 -89)`}
            >
              <Path
                d="M70 84 C71 49 91 31 120 31 C149 31 169 49 170 84 C173 126 151 151 120 151 C89 151 67 126 70 84 Z"
                fill={`url(#${skinGradientId})`}
                stroke={skin.shade}
                strokeWidth="3"
              />
              <Path
                d="M91 63 C102 45 129 39 149 51"
                stroke="#ffffff"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.18"
              />
              <Path
                d="M92 121 C102 128 138 128 149 121"
                stroke={skin.blush}
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.28"
              />
            </G>
            <Path
              d={hairPath}
              fill={`url(#${hairGradientId})`}
              stroke="#151515"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <Path
              d="M82 79 C101 61 123 54 154 66"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <Path
              d="M95 54 C105 45 119 40 132 42"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <Path
              d="M78 83 C91 72 104 65 119 62"
              stroke="rgba(0,0,0,0.18)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <Path
              d={
                browTilt
                  ? 'M88 90 C99 84 107 84 116 89'
                  : 'M88 91 C98 88 107 88 116 91'
              }
              stroke="#25211f"
              strokeWidth={config.browStyle === 'bold' ? 5 : 3}
              strokeLinecap="round"
            />
            <Path
              d={
                browTilt
                  ? 'M151 90 C142 84 133 84 124 89'
                  : 'M151 91 C141 88 132 88 124 91'
              }
              stroke="#25211f"
              strokeWidth={config.browStyle === 'bold' ? 5 : 3}
              strokeLinecap="round"
            />
            <Ellipse
              cx="101"
              cy="105"
              rx={eyeWidth}
              ry={eyeHeight}
              fill="#2a211b"
            />
            <Ellipse
              cx="139"
              cy="105"
              rx={eyeWidth}
              ry={eyeHeight}
              fill="#2a211b"
            />
            {config.eyeStyle !== 'calm' ? (
              <>
                <Circle cx="96" cy="101" r="3" fill="#ffffff" />
                <Circle cx="134" cy="101" r="3" fill="#ffffff" />
              </>
            ) : null}
            <Path
              d={mouthPath}
              stroke="#50342a"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            {config.accessory === 'glasses' ? (
              <Path
                d="M84 101 C90 94 111 94 116 101 M124 101 C129 94 150 94 156 101 M116 101 L124 101"
                stroke="#1f2937"
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
              />
            ) : null}
            {config.accessory === 'cap' ? (
              <>
                <Path
                  d="M83 61 C94 35 143 33 159 59 C136 54 106 54 83 61 Z"
                  fill={accent.detail}
                  stroke="#151515"
                  strokeWidth="3"
                />
                <Path
                  d="M118 61 C139 58 160 60 178 71"
                  stroke={accent.secondary}
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </>
            ) : null}
            {config.accessory === 'headphones' ? (
              <>
                <Path
                  d="M78 89 C78 48 162 48 162 89"
                  stroke={accent.detail}
                  strokeWidth="5"
                  fill="none"
                  strokeLinecap="round"
                />
                <Rect
                  x="65"
                  y="88"
                  width="16"
                  height="28"
                  rx="7"
                  fill={accent.detail}
                />
                <Rect
                  x="159"
                  y="88"
                  width="16"
                  height="28"
                  rx="7"
                  fill={accent.detail}
                />
              </>
            ) : null}
            {config.accessory === 'spark' || isQuestion ? (
              <Path
                d="M177 52 L182 64 L194 69 L182 74 L177 86 L172 74 L160 69 L172 64 Z"
                fill={accent.secondary}
              />
            ) : null}
            {isQuestion ? (
              <Path
                d="M184 42 C184 30 204 30 204 43 C204 54 190 54 190 64"
                stroke="#f2576b"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
              />
            ) : null}
          </G>
        </G>
      </Svg>
    </View>
  );
}
