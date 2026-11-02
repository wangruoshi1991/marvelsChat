import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  AgentDTO,
  OwnedAgentDTO,
  ProductCatalogProductDTO,
} from '../../models/api';
import { appErrorText, textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import { agentScopeListLabel, hasUnknownAgentScope } from './agentPresentation';
import { agentAccessSnapshot } from './agentAccess';
import {
  AlbumAIConsentVersion,
  albumAssistantConsentRequirement,
  albumAssistantDisclosure,
} from '../station/albumAssistantAuthorization';

export type AgentAccessAction = 'add' | 'remove';

type Options = {
  accessToken: string;
  active?: boolean;
  language: Language;
  agents: AgentDTO[];
  ownedAgents: OwnedAgentDTO[];
  products: ProductCatalogProductDTO[];
  catalogRevision: string | null;
  externalBusy?: boolean;
  onSetAgentEnabled: (
    id: string,
    enabled: boolean,
    grantedScopes: string[],
    albumAIConsentVersion?: AlbumAIConsentVersion,
    productVersionId?: string,
  ) => Promise<OwnedAgentDTO>;
  onChanged?: (action: AgentAccessAction) => void;
  onError?: (error: unknown) => void;
};

export function useAgentAccessConfirmation(options: Options) {
  const current = useRef(options);
  current.current = options;
  const renderSnapshot = JSON.stringify({
    session: options.accessToken,
    active: options.active !== false,
    access: agentAccessSnapshot(options.agents, options.ownedAgents, {
      products: options.products,
      catalogRevision: options.catalogRevision,
    }),
  });
  const revision = useRef({ snapshot: renderSnapshot, value: 0 });
  if (revision.current.snapshot !== renderSnapshot)
    revision.current = {
      snapshot: renderSnapshot,
      value: revision.current.value + 1,
    };
  const mounted = useRef(true);
  const confirmation = useRef(0);
  const pending = useRef(new Set<string>());
  const [updatingAgents, setUpdatingAgents] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      confirmation.current += 1;
    };
  }, []);
  const snapshot = () =>
    JSON.stringify({
      session: current.current.accessToken,
      active: current.current.active !== false,
      access: agentAccessSnapshot(
        current.current.agents,
        current.current.ownedAgents,
        {
          products: current.current.products,
          catalogRevision: current.current.catalogRevision,
        },
      ),
    });
  const reportError = (id: string, cause: unknown) => {
    if (!mounted.current) return;
    setErrors(value => ({
      ...value,
      [id]: appErrorText(
        current.current.language,
        cause,
        'Agent 操作失败，请重试',
        'Could not complete the agent action. Try again.',
      ),
    }));
    current.current.onError?.(cause);
  };
  const prepareConfirmation = async (id: string, action: AgentAccessAction) => {
    const { language, agents, ownedAgents } = current.current;
    if (
      !mounted.current ||
      current.current.active === false ||
      pending.current.has(id) ||
      current.current.externalBusy
    )
      return;
    const agent = agents.find(item => item.key === id);
    const owned = ownedAgents.find(item => item.id === id && item.enabled);
    if (
      !current.current.accessToken ||
      !agent ||
      (action === 'add' ? !!owned : !owned)
    ) {
      reportError(
        id,
        new Error(
          textFor(
            language,
            '账号或 Agent 授权已变化，请刷新后重试。',
            'Account or agent access changed. Refresh and try again.',
          ),
        ),
      );
      return;
    }
    const enabled = action !== 'remove';
    const scopes = enabled ? [...agent.permissions] : [];
    const products = current.current.products.filter(product =>
      product.dependencies.some(dependency => dependency.agentKey === id),
    );
    const product = products.length === 1 ? products[0] : null;
    if (
      enabled &&
      (!current.current.catalogRevision ||
        product?.status !== 'published' ||
        !product.productVersionId)
    ) {
      reportError(id, new Error('产品版本不可用，请刷新目录后重新确认。'));
      return;
    }
    const productVersionId = enabled ? product?.productVersionId : undefined;
    if (enabled && hasUnknownAgentScope(scopes)) {
      reportError(
        id,
        new Error(
          textFor(
            language,
            '此 Agent 的权限列表含有当前版本无法识别的项目，请更新应用后重试。',
            'This Agent declares access this app version cannot identify. Update the app and try again.',
          ),
        ),
      );
      return;
    }
    const request = ++confirmation.current;
    const captured = snapshot();
    const capturedRevision = revision.current.value;
    const requestSession = current.current.accessToken;
    const isConfirmationCurrent = () =>
      mounted.current &&
      confirmation.current === request &&
      snapshot() === captured &&
      revision.current.value === capturedRevision;
    let consentVersion: AlbumAIConsentVersion | undefined;
    if (id === 'album-manager' && enabled) {
      pending.current.add(id);
      setUpdatingAgents(new Set(pending.current));
      try {
        consentVersion = await albumAssistantConsentRequirement(
          requestSession,
          language,
          isConfirmationCurrent,
        );
      } catch (cause) {
        if (
          confirmation.current === request &&
          current.current.accessToken === requestSession
        )
          reportError(id, cause);
        return;
      } finally {
        pending.current.delete(id);
        if (mounted.current) setUpdatingAgents(new Set(pending.current));
      }
      if (!isConfirmationCurrent()) return;
    }
    const scopeText = (items: string[]) => agentScopeListLabel(items, language);
    const label = textFor(
      language,
      action === 'add' ? '添加' : '移除',
      action === 'add' ? 'Add' : 'Remove',
    );
    const description = [
      enabled && product ? `${product.displayName} · v${product.version}` : '',
      action === 'add'
        ? textFor(language, '授权范围：', 'Access scopes: ') + scopeText(scopes)
        : textFor(language, '移除后撤回：', 'Revoke on removal: ') +
          scopeText(owned?.grantedScopes || []),
      action === 'remove'
        ? textFor(
            language,
            id === 'album-manager'
              ? '移除会撤回相册 AI 授权并清理检索索引，原素材保留。'
              : '移除后停止此 Agent 的授权访问，历史对话保留。',
            id === 'album-manager'
              ? 'This revokes Album AI consent and removes the search index. Original media is kept.'
              : 'Revoke access for this agent. Chat history is kept.',
          )
        : consentVersion
        ? albumAssistantDisclosure(language)
        : textFor(
            language,
            '确认添加即授权以上全部范围。你可以随时在“我的 Agent”移除。',
            'Adding grants all scopes above. You can remove this agent at any time in My Agents.',
          ),
    ]
      .filter(Boolean)
      .join('\n\n');
    const cancel = () => {
      if (confirmation.current === request) confirmation.current += 1;
    };
    Alert.alert(
      `${label}${language === 'zh' ? '' : ' '}${agent.name}`,
      description,
      [
        {
          text: textFor(language, '取消', 'Cancel'),
          style: 'cancel',
          onPress: cancel,
        },
        {
          text: consentVersion
            ? textFor(
                language,
                `同意并${label}`,
                `Agree and ${label.toLowerCase()}`,
              )
            : label,
          style: enabled ? 'default' : 'destructive',
          onPress: async () => {
            if (!mounted.current || confirmation.current !== request) return;
            confirmation.current += 1;
            if (
              snapshot() !== captured ||
              revision.current.value !== capturedRevision
            ) {
              reportError(
                id,
                new Error(
                  textFor(
                    language,
                    '账号、Agent 信息或授权已更新，请重新查看范围后确认。',
                    'Account, agent information or access changed. Review the current scopes and confirm again.',
                  ),
                ),
              );
              return;
            }
            if (pending.current.has(id) || current.current.externalBusy) return;
            pending.current.add(id);
            setUpdatingAgents(new Set(pending.current));
            setErrors(value => ({ ...value, [id]: '' }));
            try {
              const setAccess = current.current.onSetAgentEnabled;
              await (enabled
                ? setAccess(
                    id,
                    enabled,
                    scopes,
                    consentVersion,
                    productVersionId || undefined,
                  )
                : setAccess(id, enabled, scopes));
              if (
                mounted.current &&
                current.current.accessToken === requestSession
              )
                current.current.onChanged?.(action);
            } catch (cause) {
              if (current.current.accessToken === requestSession)
                reportError(id, cause);
            } finally {
              pending.current.delete(id);
              if (mounted.current) setUpdatingAgents(new Set(pending.current));
            }
          },
        },
      ],
      { cancelable: true, onDismiss: cancel },
    );
  };
  const confirmAccess = (id: string, action: AgentAccessAction) => {
    prepareConfirmation(id, action).catch(cause => reportError(id, cause));
  };
  return { confirmAccess, updatingAgents, errors };
}
