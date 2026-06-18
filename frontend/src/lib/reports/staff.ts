import { supabase } from '@/lib/supabase';
import type { FileItem } from '@/lib/types';

export interface MyDocFilters {
  from?: string;
  to?: string;
  status?: string;
  documentTypeId?: string;
}

export async function listMyDocuments(userId: string, f: MyDocFilters): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select('*, document_type:document_types(name, publishable)')
    .eq('owner_id', userId)
    .neq('state', 'trashed')
    .order('created_at', { ascending: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.documentTypeId) q = q.eq('document_type_id', f.documentTypeId);
  if (f.from) q = q.gte('created_at', f.from);
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59`);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}
