import {
  UIPreferencePreviewDTO,
  UIPreferences,
} from '../../features/ui/uiPreferenceTypes';
import {
  assertUIPreferencesContract,
  uiPreferencesHeaders,
} from '../aiContract';
import { request } from './http';

export const uiPreferencesApi = {
  getUIPreferencePreview(token: string, previewId: string) {
    assertUIPreferencesContract(token);
    return request<UIPreferencePreviewDTO>(
      `/api/ui/preferences/previews/${encodeURIComponent(previewId)}`,
      {
        token,
        headers: uiPreferencesHeaders,
      },
    );
  },
  previewUIPreferences(
    token: string,
    instruction: string,
    surface?: keyof UIPreferences['surfaces'],
  ) {
    assertUIPreferencesContract(token);
    return request<UIPreferencePreviewDTO>('/api/ui/preferences/preview', {
      method: 'POST',
      token,
      headers: uiPreferencesHeaders,
      body: { instruction, ...(surface ? { surface } : {}) },
    });
  },
  confirmUIPreferences(token: string, previewId: string, baseRevision: number) {
    assertUIPreferencesContract(token);
    return request<{
      status: 'confirmed';
      previewId: string;
      preferences: UIPreferences;
    }>('/api/ui/preferences/confirm', {
      method: 'POST',
      token,
      headers: uiPreferencesHeaders,
      body: { previewId, baseRevision },
    });
  },
  resetUIPreferences(token: string, baseRevision: number) {
    assertUIPreferencesContract(token);
    return request<{ status: 'reset'; preferences: UIPreferences }>(
      '/api/ui/preferences/reset',
      {
        method: 'POST',
        token,
        headers: uiPreferencesHeaders,
        body: { baseRevision },
      },
    );
  },
  undoUIPreferences(token: string, baseRevision: number) {
    assertUIPreferencesContract(token);
    return request<{
      status: 'undone';
      previewId: string;
      preferences: UIPreferences;
    }>('/api/ui/preferences/undo', {
      method: 'POST',
      token,
      headers: uiPreferencesHeaders,
      body: { baseRevision },
    });
  },
};
