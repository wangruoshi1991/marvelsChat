import { NativeModules } from 'react-native';
import { APIEnvelope, APIErrorEnvelope } from '../../models/api';

const nativeConfig = NativeModules.MiaoxunConfigModule as
  | { apiBaseURL?: unknown }
  | undefined;

const defaultRequestTimeoutMs = 20000;
export const longRequestTimeoutMs = 45000;

export class MiaoxunApiError extends Error {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
  isNetworkError: boolean;
  isTimeout: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      details?: Record<string, unknown>;
      isNetworkError?: boolean;
      isTimeout?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'MiaoxunApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.isNetworkError = options.isNetworkError || false;
    this.isTimeout = options.isTimeout || false;
  }
}

export const isAuthSessionError = (error: unknown) =>
  error instanceof MiaoxunApiError &&
  (error.status === 401 || error.status === 403);

export const API_BASE_URL =
  typeof nativeConfig?.apiBaseURL === 'string' ? nativeConfig.apiBaseURL : '';

const normalizedApiBaseURL = (() => {
  const value = API_BASE_URL.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/.test(value)) {
    throw new Error('Miaoxun API_BASE_URL must be an absolute HTTP(S) URL.');
  }
  return value;
})();

const stripApiPrefix = (path: string) => path.replace(/^\/api(?=\/|$)/, '');
const sanitizeUrlForLog = (url: string) =>
  url.replace(/([?&]token=)[^&]+/gi, '$1[redacted]');

const summarizeDataForLog = (value: object) => {
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  const input = value as Record<string, unknown>;
  return {
    keys: Object.keys(input).slice(0, 16),
    registeredAgents:
      input.agents &&
      typeof input.agents === 'object' &&
      Array.isArray((input.agents as { registered?: unknown }).registered)
        ? (input.agents as { registered: unknown[] }).registered.length
        : undefined,
    ownedAgents:
      input.agents &&
      typeof input.agents === 'object' &&
      Array.isArray((input.agents as { owned?: unknown }).owned)
        ? (input.agents as { owned: unknown[] }).owned.length
        : undefined,
    stationContent:
      input.stationContent && typeof input.stationContent === 'object'
        ? Object.fromEntries(
            Object.entries(input.stationContent as Record<string, unknown>).map(
              ([key, item]) => [key, Array.isArray(item) ? item.length : null],
            ),
          )
        : undefined,
  };
};

const sanitizeBodyForLog = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, item]) => {
    if (/password|token|secret|key|authorization|credential/i.test(key)) {
      output[key] = '[redacted]';
      return;
    }
    if (key === 'data' && item && typeof item === 'object') {
      output[key] = summarizeDataForLog(item);
      return;
    }
    output[key] = sanitizeBodyForLog(item);
  });
  return output;
};

const logNetworkEvent = (
  phase: 'request' | 'response' | 'error',
  payload: Record<string, unknown>,
) => {
  console.info('[MiaoxunNetwork]', {
    environment: __DEV__ ? 'debug' : 'testflight',
    apiBaseURL: API_BASE_URL,
    ...payload,
    phase,
  });
};

export const buildApiUrl = (path: string) => {
  const rawPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPath = normalizedApiBaseURL.endsWith('/api')
    ? stripApiPrefix(rawPath)
    : rawPath;
  return `${normalizedApiBaseURL}${normalizedPath}`;
};

export const buildRealtimeUrl = (path: string) =>
  buildApiUrl(path).replace(/^http/i, 'ws');

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs || defaultRequestTimeoutMs,
  );
  const method = options.method || 'GET';
  const finalUrl = buildApiUrl(path);
  let response: Response;
  let responseText = '';

  try {
    logNetworkEvent('request', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      hasAuthorization: Boolean(options.token),
      requestBody: options.body ? sanitizeBodyForLog(options.body) : undefined,
    });
    response = await fetch(finalUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    logNetworkEvent('error', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      message: error instanceof Error ? error.message : 'Network error',
    });
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MiaoxunApiError('请求超时，请确认手机与后端网络连接后重试。', {
        isNetworkError: true,
        isTimeout: true,
      });
    }
    throw new MiaoxunApiError(
      '网络连接失败，请确认手机与后端网络连接后重试。',
      {
        isNetworkError: true,
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) {
    logNetworkEvent('response', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      status: response.status,
      responseBody: null,
    });
    if (!response.ok) {
      throw new MiaoxunApiError(`请求失败：${response.status}`, {
        status: response.status,
      });
    }
    return undefined as T;
  }

  responseText = await response.text().catch(() => '');
  const payload = (responseText ? parseJson(responseText) : null) as
    | APIEnvelope<T>
    | APIErrorEnvelope
    | null;

  logNetworkEvent('response', {
    method,
    url: sanitizeUrlForLog(finalUrl),
    status: response.status,
    responseBody: payload
      ? sanitizeBodyForLog(payload)
      : responseText
      ? '[non-json response]'
      : null,
  });

  if (!response.ok) {
    const message =
      payload && 'error' in payload
        ? payload.error?.message || `请求失败：${response.status}`
        : `请求失败：${response.status}`;
    const details =
      payload && 'error' in payload ? payload.error?.details : undefined;
    throw new MiaoxunApiError(message, {
      status: response.status,
      code: details?.code,
      details,
    });
  }

  if (!payload || !('data' in payload)) {
    throw new Error('后端响应格式无效。');
  }

  return payload.data;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
