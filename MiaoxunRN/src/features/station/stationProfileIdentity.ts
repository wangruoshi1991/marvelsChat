import {
  LocationResolveDTO,
  ProfileIdentityDTO,
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
