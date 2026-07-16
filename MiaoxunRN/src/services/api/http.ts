import { NativeModules } from 'react-native';
import { APIEnvelope, APIErrorEnvelope } from '../../models/api';

const nativeConfig = NativeModules.MiaoxunConfigModule as
  | { apiBaseURL?: unknown }
  | undefined;

const defaultRequestTimeoutMs = 20000;
export const longRequestTimeoutMs = 45000;

export class MiaoxunApiError extends Error {
  status?: number;
  requestId?: string;
  isNetworkError: boolean;
  isTimeout: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      requestId?: string;
      isNetworkError?: boolean;
      isTimeout?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'MiaoxunApiError';
    this.status = options.status;
    this.requestId = options.requestId;
    this.isNetworkError = options.isNetworkError || false;
    this.isTimeout = options.isTimeout || false;
  }
}

export const isAuthSessionError = (error: unknown) =>
  error instanceof MiaoxunApiError && error.status === 401;

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

export const joinApiUrl = (baseUrl: string, path: string) => {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  const rawPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedPath = normalizedBaseUrl.endsWith('/api')
    ? stripApiPrefix(rawPath)
    : rawPath;
  return `${normalizedBaseUrl}${normalizedPath}`;
};

export const resolvePublicUrl = (baseUrl: string, value: string) => {
  const target = value.trim();
  if (/^https?:\/\/[^/]+/i.test(target)) {
    return target;
  }
  if (target.startsWith('//')) {
    throw new Error('Miaoxun public URL must not be protocol-relative.');
  }
  const origin = baseUrl.trim().match(/^(https?:\/\/[^/]+)/i)?.[1];
  if (!origin) {
    throw new Error('Miaoxun API base URL must include an HTTP(S) origin.');
  }
  return `${origin}${target.startsWith('/') ? target : `/${target}`}`;
};

const sanitizeUrlForLog = (url: string) =>
  url
    .replace(
      /(\/(?:homepage-(?:previews|shares)|preview|s)\/)[^/?#]+/gi,
      '$1[redacted]',
    )
    .replace(/([?&][^=&#]+)=([^&#]*)/g, '$1=[redacted]');

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

const summarizeBodyForLog = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return value === null || value === undefined ? value : `[${typeof value}]`;
  }
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  const input = value as Record<string, unknown>;
  return {
    keys: Object.keys(input).slice(0, 16),
    data:
      input.data && typeof input.data === 'object'
        ? summarizeDataForLog(input.data)
        : undefined,
  };
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
  return joinApiUrl(normalizedApiBaseURL, path);
};

export const buildRealtimeUrl = (path: string) =>
  buildApiUrl(path).replace(/^http/i, 'ws');

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
  timeoutMs?: number;
  headers?: Record<string, string>;
  expireSessionOnUnauthorized?: boolean;
};

type AuthSessionExpiredEvent = {
  token: string;
  requestId: string;
};

type AuthSessionExpiredHandler = (
  event: AuthSessionExpiredEvent,
) => void | Promise<void>;

let authSessionExpiredHandler: AuthSessionExpiredHandler | null = null;

export const setAuthSessionExpiredHandler = (
  handler: AuthSessionExpiredHandler | null,
) => {
  authSessionExpiredHandler = handler;
  return () => {
    if (authSessionExpiredHandler === handler) {
      authSessionExpiredHandler = null;
    }
  };
};

const createRequestId = () =>
  `mx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

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
  const clientRequestId = createRequestId();
  let response: Response;
  let responseText = '';

  try {
    logNetworkEvent('request', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      requestId: clientRequestId,
      hasAuthorization: Boolean(options.token),
      requestBody: options.body ? summarizeBodyForLog(options.body) : undefined,
    });
    response = await fetch(finalUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': clientRequestId,
        ...options.headers,
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    logNetworkEvent('error', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      requestId: clientRequestId,
      errorType: error instanceof Error ? error.name : 'NetworkError',
    });
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MiaoxunApiError('请求超时，请确认手机与后端网络连接后重试。', {
        requestId: clientRequestId,
        isNetworkError: true,
        isTimeout: true,
      });
    }
    throw new MiaoxunApiError(
      '网络连接失败，请确认手机与后端网络连接后重试。',
      {
        requestId: clientRequestId,
        isNetworkError: true,
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseRequestId =
    response.headers?.get?.('x-request-id') || clientRequestId;

  if (
    response.status === 401 &&
    options.token &&
    options.expireSessionOnUnauthorized !== false &&
    authSessionExpiredHandler
  ) {
    await Promise.resolve(
      authSessionExpiredHandler({
        token: options.token,
        requestId: responseRequestId,
      }),
    ).catch(() => undefined);
  }

  if (response.status === 204) {
    logNetworkEvent('response', {
      method,
      url: sanitizeUrlForLog(finalUrl),
      requestId: responseRequestId,
      status: response.status,
      responseBody: null,
    });
    if (!response.ok) {
      throw new MiaoxunApiError(`请求失败：${response.status}`, {
        status: response.status,
        requestId: responseRequestId,
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
    requestId: responseRequestId,
    status: response.status,
    responseBody: payload
      ? summarizeBodyForLog(payload)
      : responseText
      ? '[non-json response]'
      : null,
  });

  if (!response.ok) {
    const message =
      payload && 'error' in payload
        ? payload.error?.message || `请求失败：${response.status}`
        : `请求失败：${response.status}`;
    throw new MiaoxunApiError(message, {
      status: response.status,
      requestId: responseRequestId,
    });
  }

  if (!payload || !('data' in payload)) {
    throw new MiaoxunApiError('后端响应格式无效。', {
      status: response.status,
      requestId: responseRequestId,
    });
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
