import { FileText, FileSpreadsheet, FileType2, File as FileIcon, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAP: Record<string, { Icon: typeof FileText; color: string }> = {
  pdf: { Icon: FileType2, color: 'text-rose-500' },
  docx: { Icon: FileText, color: 'text-blue-500' },
  gdoc: { Icon: FileText, color: 'text-blue-500' },
  xlsx: { Icon: FileSpreadsheet, color: 'text-emerald-500' },
  gsheet: { Icon: FileSpreadsheet, color: 'text-emerald-500' },
  other: { Icon: FileIcon, color: 'text-slate-400' },
};

export function FileKindIcon({ kind, size = 20, className }: { kind: string; size?: number; className?: string }) {
  const { Icon, color } = MAP[kind] ?? MAP.other;
  return <Icon size={size} className={cn(color, className)} />;
}

export function FolderIcon({ size = 20, className }: { size?: number; className?: string }) {
  return <Folder size={size} className={cn('fill-gold-200 text-gold-500', className)} />;
}
