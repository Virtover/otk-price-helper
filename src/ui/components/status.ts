import type { RowStatus } from '../../core/types';

export const STATUS_COLOR: Record<RowStatus, string | undefined> = {
  ok: undefined,
  anchor: 'blue',
  sale: 'grape',
  override: 'yellow',
  error: 'red',
};

export const statusBg = (status: RowStatus) => {
  const c = STATUS_COLOR[status];
  return c ? `var(--mantine-color-${c}-light)` : undefined;
};
