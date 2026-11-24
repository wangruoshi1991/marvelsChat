import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { PublicProfileDTO, UserDTO } from '../../models/api';
import { scanQRCode } from '../../services/qrScanner';
import { appErrorText, textFor } from '../../shared/i18n';
import { Language } from '../session/useMiaoxunSession';

const miaoxunScanPayloadPattern =
  /^(miaoxun:\/\/ai\/\d{12}(?:[?&][^#\s]+)?|\d{12})$/;

type ProfileFlowsOptions = {
  sessionOwner: string;
  profileVisible: boolean;
  language: Language;
  user: UserDTO | null;
  loadPublicProfileByAiId: (aiId: string) => Promise<PublicProfileDTO>;
  resolveScanPayload: (payload: string) => Promise<PublicProfileDTO>;
  showToast: (message: string) => void;
  openModal: (route: 'qr-code' | 'public-profile') => void;
  closePublicProfileModal: () => void;
};

export function useProfileFlows({
  sessionOwner,
  profileVisible,
  language,
  user,
  loadPublicProfileByAiId,
  resolveScanPayload,
  showToast,
  openModal,
  closePublicProfileModal,
}: ProfileFlowsOptions) {
  const [qrPayload, setQrPayload] = useState('');
  const [publicProfile, setPublicProfile] = useState<PublicProfileDTO | null>(
    null,
  );
  const [loadingProfile, setLoadingProfile] = useState(false);
  const isScanningRef = useRef(false);
  const generation = useRef(0);
  const resetProfile = useCallback(() => {
    generation.current += 1;
    setPublicProfile(null);
    setLoadingProfile(false);
  }, []);
  useLayoutEffect(() => {
    resetProfile();
    setQrPayload('');
    closePublicProfileModal();
    return () => {
      generation.current += 1;
    };
  }, [sessionOwner, resetProfile, closePublicProfileModal]);
  const wasVisible = useRef(profileVisible);
  useLayoutEffect(() => {
    if (wasVisible.current && !profileVisible) resetProfile();
    wasVisible.current = profileVisible;
  }, [profileVisible, resetProfile]);

  const closeProfile = () => {
    resetProfile();
    closePublicProfileModal();
  };
  const displayedGeneration = generation.current;
  const isCurrentProfile = () =>
    publicProfile !== null && generation.current === displayedGeneration;
  const updateRelation = (patch: Partial<PublicProfileDTO['relation']>) => {
    if (!isCurrentProfile()) return;
    setPublicProfile(current =>
      current && current.user.id === publicProfile?.user.id
        ? { ...current, relation: { ...current.relation, ...patch } }
        : current,
    );
  };

  const openQRCode = useCallback(() => {
    const aiId = user?.aiId || '';
    if (!aiId) {
      showToast(
        textFor(
          language,
          '登录后可查看 AI ID 动态码',
          'Log in to view the AI ID code',
        ),
      );
      return;
    }
    setQrPayload(
      `miaoxun://ai/${aiId}?e=${Math.floor(Date.now() / 1000) + 120}`,
    );
    openModal('qr-code');
  }, [language, openModal, showToast, user?.aiId]);

  const openPublicProfileByAiId = useCallback(
    async (aiId: string) => {
      const request = ++generation.current;
      setPublicProfile(null);
      setLoadingProfile(true);
      openModal('public-profile');
      try {
        const profile = await loadPublicProfileByAiId(aiId);
        if (generation.current !== request) return;
        setPublicProfile(profile);
      } catch (error) {
        if (generation.current !== request) return;
        closePublicProfileModal();
        showToast(
          appErrorText(
            language,
            error,
            '无法打开用户主页',
            'Cannot open profile',
          ),
        );
      } finally {
        if (generation.current === request) setLoadingProfile(false);
      }
    },
    [
      language,
      loadPublicProfileByAiId,
      openModal,
      closePublicProfileModal,
      showToast,
    ],
  );

  const startQRCodeScan = useCallback(async () => {
    if (isScanningRef.current) {
      return;
    }
    isScanningRef.current = true;
    const request = ++generation.current;
    try {
      const value = await scanQRCode();
      if (generation.current !== request) return;
      if (!miaoxunScanPayloadPattern.test(value.trim())) {
        showToast(
          textFor(
            language,
            '这不是妙讯主页二维码',
            'This is not a Miaoxun profile code',
          ),
        );
        return;
      }
      setPublicProfile(null);
      setLoadingProfile(true);
      openModal('public-profile');
      const profile = await resolveScanPayload(value);
      if (generation.current === request) setPublicProfile(profile);
    } catch (error) {
      if (generation.current !== request) return;
      closePublicProfileModal();
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined;
      if (code === 'scanner_cancelled') return;
      if (code === 'camera_denied') {
        Alert.alert(
          textFor(language, '需要相机权限', 'Camera access needed'),
          textFor(
            language,
            '可在系统设置中允许妙讯使用相机，然后重新扫码。',
            'Allow camera access in Settings, then scan again.',
          ),
          [
            { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
            {
              text: textFor(language, '打开设置', 'Open Settings'),
              onPress: () => {
                if (generation.current !== request) return;
                Linking.openSettings().catch(() => {
                  if (generation.current === request) {
                    showToast(
                      textFor(
                        language,
                        '无法打开系统设置',
                        'Cannot open Settings',
                      ),
                    );
                  }
                });
              },
            },
          ],
        );
        return;
      }
      showToast(appErrorText(language, error, '扫码失败', 'Scan failed'));
    } finally {
      isScanningRef.current = false;
      if (generation.current === request) setLoadingProfile(false);
    }
  }, [
    closePublicProfileModal,
    language,
    openModal,
    resolveScanPayload,
    showToast,
  ]);

  return {
    qrPayload,
    publicProfile,
    loadingProfile,
    isScanning: () => isScanningRef.current,
    updateRelation,
    isCurrentProfile,
    closeProfile,
    openQRCode,
    openPublicProfileByAiId,
    startQRCodeScan,
  };
}
