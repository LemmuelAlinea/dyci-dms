import { supabase } from './supabase';
import type { DocStatus, FileItem } from './types';

const OWNER = 'owner:profiles!files_owner_id_fkey(*)';

export interface SearchFilters {
  term?: string;
  documentTypeId?: string;
  categoryId?: string;
  status?: DocStatus | '';
  metadata?: Record<string, string>;
}

function sanitize(term: string): string {
  // strip characters that break PostgREST's or() filter grammar
  return term.replace(/[(),]/g, ' ').trim();
}

/** Filtered file search. RLS limits results to what the caller may see. */
export async function searchFiles(orgId: string, f: SearchFilters): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select(`*, ${OWNER}, document_type:document_types(name, publishable)`)
    .eq('org_id', orgId)
    .neq('state', 'trashed');

  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  if (f.categoryId) q = q.eq('category_id', f.categoryId);
  if (f.status) q = q.eq('status', f.status);

  const term = f.term ? sanitize(f.term) : '';
  if (term) q = q.or(`name.ilike.%${term}%,reference_no.ilike.%${term}%`);

  for (const [key, value] of Object.entries(f.metadata ?? {})) {
    if (value?.trim()) q = q.ilike(`metadata->>${key}`, `%${value.trim()}%`);
  }

  const { data, error } = await q.order('updated_at', { ascending: false }).limit(80);
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}

export function hasAnyFilter(f: SearchFilters): boolean {
  return Boolean(
    f.term?.trim() ||
      f.documentTypeId ||
      f.categoryId ||
      f.status ||
      Object.values(f.metadata ?? {}).some((v) => v?.trim()),
  );
}
