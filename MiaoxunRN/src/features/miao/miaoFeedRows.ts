import { AgentWorkspace } from '../../models/agentWorkspace';
import { AITaskDTO } from '../../models/aiTask';
import { MiaoCardViewState } from './miaoCardState';

export type MiaoFeedEntry =
  | { kind: 'task'; task: AITaskDTO }
  | { kind: 'workspace'; task: AgentWorkspace };

export const miaoFeedEntryId = (entry: MiaoFeedEntry) =>
  `${entry.kind}:${entry.task.id}`;

export type MiaoFeedRow = {
  key: string;
  entries: MiaoFeedEntry[];
  fullWidth: boolean;
};

/** Preserve feed order while expanded cards span both waterfall columns. */
export function miaoFeedRows(
  entries: MiaoFeedEntry[],
  columns: 1 | 2,
  states: Readonly<Record<string, MiaoCardViewState>>,
): MiaoFeedRow[] {
  const rows: MiaoFeedRow[] = [];
  let pending: MiaoFeedEntry[] = [];
  const append = (items: MiaoFeedEntry[], fullWidth: boolean) => {
    if (!items.length) return;
    rows.push({
      key: items.map(miaoFeedEntryId).join('|'),
      entries: items,
      fullWidth,
    });
  };
  for (const entry of entries) {
    if (
      columns === 1 ||
      (states[miaoFeedEntryId(entry)] || 'summary') !== 'summary'
    ) {
      append(pending, false);
      pending = [];
      append([entry], true);
    } else {
      pending.push(entry);
      if (pending.length === 2) {
        append(pending, false);
        pending = [];
      }
    }
  }
  append(pending, false);
  return rows;
}
