import {
  LocationResolveDTO,
  ProfileIdentityDTO,
  ProfileDTO,
  ProfileLanguageCode,
} from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/useMiaoxunSession';

export const profileLanguageOptions: {
  code: ProfileLanguageCode;
  zh: string;
  en: string;
}[] = [
  { code: 'zh', zh: '中文', en: 'Chinese' },
  { code: 'en', zh: '英语', en: 'English' },
  { code: 'ja', zh: '日语', en: 'Japanese' },
  { code: 'ko', zh: '韩语', en: 'Korean' },
  { code: 'fr', zh: '法语', en: 'French' },
  { code: 'de', zh: '德语', en: 'German' },
  { code: 'es', zh: '西班牙语', en: 'Spanish' },
  { code: 'pt', zh: '葡萄牙语', en: 'Portuguese' },
  { code: 'ru', zh: '俄语', en: 'Russian' },
  { code: 'ar', zh: '阿拉伯语', en: 'Arabic' },
];

export function profileDisplayRegionCandidates(location: LocationResolveDTO) {
  const seen = new Set<string>();
  return location.activityAreaCandidates.filter(candidate => {
    if (!['city', 'province', 'state'].includes(candidate.type)) return false;
    if (!candidate.name.trim() || seen.has(candidate.name)) return false;
    seen.add(candidate.name);
    return true;
  });
}

export function profileIdentityTags(
  identity: ProfileIdentityDTO,
  language: Language,
) {
  const tags: string[] = [];
  if (identity.publicLocation) tags.push(identity.publicLocation);
  if (identity.experienceYears !== null) {
    const years = identity.experienceYears;
    tags.push(
      textFor(
        language,
        `${years}年经验`,
        `${years} ${years === 1 ? 'year' : 'years'} of experience`,
      ),
    );
  }
  if (identity.languages.length) {
    tags.push(
      identity.languages
        .map(code => {
          const option = profileLanguageOptions.find(
            item => item.code === code,
          );
          return option ? textFor(language, option.zh, option.en) : code;
        })
        .join(' / '),
    );
  }
  return tags;
}

// Session defaults use '未设置' before the first bootstrap; that is not a place.
const unsetLocation = new Set(['', '未设置']);

/**
 * Prototype `.me-location` shows a region only (「上海 · 中国」), never a street
 * address. `publicLocation` is already chosen from region-level candidates, so
 * prefer it and fall back to the saved activity area.
 */
export function stationDisplayRegionLabel(
  profile: Pick<ProfileDTO, 'publicLocation' | 'activityArea'>,
) {
  const publicLocation = profile.publicLocation.trim();
  if (publicLocation && !unsetLocation.has(publicLocation))
    return publicLocation;
  const activityArea = profile.activityArea.trim();
  return unsetLocation.has(activityArea) ? '' : activityArea;
}

/** Saved activity area and community as one line, or '' when none is chosen. */
export function stationLocationLabel(
  profile: Pick<ProfileDTO, 'activityArea' | 'community'>,
) {
  return [profile.activityArea, profile.community]
    .map(value => value.trim())
    .filter(value => !unsetLocation.has(value))
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(' · ');
}
