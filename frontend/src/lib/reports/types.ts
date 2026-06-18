import type { ReactNode } from 'react';

export interface ColumnDef<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  total?: (rows: T[]) => ReactNode;
  align?: 'left' | 'right';
  defaultHidden?: boolean;
}
