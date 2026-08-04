import { useCallback, useRef, useState } from 'react';
import { PublicProfileDTO, UserDTO } from '../../models/api';
import { scanQRCode } from '../../services/qrScanner';
import { appErrorText, textFor } from '../../shared/i18n';
import { Language } from '../session/useMiaoxunSession';

const miaoxunScanPayloadPattern =
  /^(miaoxun:\/\/ai\/\d{12}(?:[?&][^#\s]+)?|\d{12})$/;

type ProfileFlowsOptions = {
  language: Language;
  user: UserDTO | null;
  loadPublicProfileByAiId: (aiId: string) => Promise<PublicProfileDTO>;
  resolveScanPayload: (payload: string) => Promise<PublicProfileDTO>;
  showToast: (message: string) => void;
  openModal: (route: 'qr-code' | 'public-profile') => void;
  closePublicProfileModal: () => void;
};

export function useProfileFlows({
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
  const [isResolvingScan, setIsResolvingScan] = useState(false);
  const isScanningRef = useRef(false);

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
      try {
        const profile = await loadPublicProfileByAiId(aiId);
        setPublicProfile(profile);
        openModal('public-profile');
      } catch (error) {
        showToast(
          appErrorText(
            language,
            error,
            '无法打开用户主页',
            'Cannot open profile',
          ),
        );
      }
    },
    [language, loadPublicProfileByAiId, openModal, showToast],
  );

  const startQRCodeScan = useCallback(async () => {
    if (isScanningRef.current) {
      return;
    }
    isScanningRef.current = true;
    try {
      const value = await scanQRCode();
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
      setIsResolvingScan(true);
      openModal('public-profile');
      const profile = await resolveScanPayload(value);
      setPublicProfile(profile);
    } catch (error) {
      closePublicProfileModal();
      const message = appErrorText(language, error, '扫码失败', 'Scan failed');
      if (!message.includes('已取消') && !message.includes('cancel')) {
        showToast(message);
      }
    } finally {
      isScanningRef.current = false;
      setIsResolvingScan(false);
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
    isResolvingScan,
    isScanning: isScanningRef.current,
    setPublicProfile,
    setIsResolvingScan,
    openQRCode,
    openPublicProfileByAiId,
    startQRCodeScan,
  };
}
