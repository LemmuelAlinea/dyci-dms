import { supabase } from './supabase';

export type FieldType = 'text' | 'longtext' | 'number' | 'money' | 'date' | 'dropdown' | 'yesno';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
}

export interface DocumentType {
  id: string;
  org_id: string;
  category_id: string | null;
  name: string;
  icon: string;
  color: string;
  reference_format: string;
  publishable: boolean;
  allow_multiple: boolean;
  fields: FieldDef[];
  active: boolean;
  sort: number;
  category?: { name: string } | null;
}

/** Active document types for an org, with their category name, in display order. */
export async function listDocumentTypes(orgId: string): Promise<DocumentType[]> {
  const { data, error } = await supabase
    .from('document_types')
    .select('*, category:categories(name)')
    .eq('org_id', orgId)
    .eq('active', true)
    .order('sort');
  if (error) throw error;
  return (data as DocumentType[]) ?? [];
}

export async function getDocumentType(id: string): Promise<DocumentType | null> {
  const { data } = await supabase.from('document_types').select('*, category:categories(name)').eq('id', id).maybeSingle();
  return (data as DocumentType) ?? null;
}

/** Atomically allocate the next reference number for a document type. */
export async function allocateReference(orgId: string, documentTypeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('allocate_reference', { p_org: orgId, p_document_type: documentTypeId });
  if (error) throw error;
  return data as string;
}
