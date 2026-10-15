// A UI location captured when assistance starts. This describes the user's
// workflow; it never grants access to resources or permission to run an action.
export type AssistMessageSource = {
  currentPage: string;
};

export function normalizeAssistMessageSource(
  source: AssistMessageSource | undefined,
): AssistMessageSource | undefined {
  if (source === undefined) return undefined;
  if (
    source === null ||
    typeof source !== 'object' ||
    typeof source.currentPage !== 'string' ||
    Array.from(source.currentPage).some(character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new Error('AI 请求来源无效，请重新选择内容后发送。');
  }
  const currentPage = source.currentPage.trim();
  if (!currentPage || currentPage.length > 120) {
    throw new Error('AI 请求来源无效，请重新选择内容后发送。');
  }
  return { currentPage };
}
