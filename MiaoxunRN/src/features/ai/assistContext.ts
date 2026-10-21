import { AIContextReference } from '../../models/aiTask';
import { AIAssistObjectReference } from '../assist/aiAssistTypes';

export const contextReferenceScope: Record<AIContextReference['kind'], string> =
  {
    'chat-message': 'messages:read',
    'station-album': 'album:read',
    'station-photo': 'album:read',
    'station-diary': 'station:read',
    'station-file': 'files:read',
  };

export function missingContextScopes(
  references: AIContextReference[],
  grantedScopes: string[],
) {
  return [
    ...new Set(references.map(ref => contextReferenceScope[ref.kind])),
  ].filter(scope => !grantedScopes.includes(scope));
}

// Reference titles are only display labels (server limit: 160 UTF-16 units).
// Full selected content stays in the visible draft or authenticated resource.
function referenceTitle(title: string) {
  if (title.length <= 160) return title;
  let label = '';
  for (const character of title) {
    if (label.length + character.length > 159) break;
    label += character;
  }
  return `${label}…`;
}

export function persistentAssistReference(
  object: AIAssistObjectReference,
): AIContextReference | null {
  if (!object.id || object.id.startsWith('local-')) return null;
  if (object.kind === 'station-file') {
    const version = object.metadata?.version;
    return typeof version === 'string' && version
      ? {
          kind: 'station-file',
          id: object.id,
          version,
          title: referenceTitle(object.title),
        }
      : null;
  }
  if (object.kind === 'ai-task') {
    const id = object.scene?.task?.inputMessageId;
    return id && !id.startsWith('local-')
      ? { kind: 'chat-message', id, title: referenceTitle(object.title) }
      : null;
  }
  if (
    object.kind !== 'chat-message' &&
    object.kind !== 'station-album' &&
    object.kind !== 'station-diary' &&
    object.kind !== 'station-photo'
  )
    return null;
  return {
    kind: object.kind,
    id: object.id,
    title: referenceTitle(object.title),
  };
}
