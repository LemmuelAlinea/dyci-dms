import { supabase } from './supabase';
import type { DocumentType, FieldDef } from './documentTypes';

export interface Category {
  id: string;
  org_id: string;
  name: string;
  sort: number;
}

export interface ChainStep {
  id: string;
  document_type_id: string;
  step_no: number;
  position_id: string;
  position?: { name: string } | null;
}

// ── Categories ───────────────────────────────────────────────────────────────
export async function listCategories(orgId: string): Promise<Category[]> {
  const { data } = await supabase.from('categories').select('*').eq('org_id', orgId).order('sort');
  return (data as Category[]) ?? [];
}
export async function createCategory(orgId: string, name: string, sort: number): Promise<void> {
  const { error } = await supabase.from('categories').insert({ org_id: orgId, name, sort });
  if (error) throw error;
}
export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('categories').update({ name }).eq('id', id);
  if (error) throw error;
}
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ── Document types ───────────────────────────────────────────────────────────
export async function listAllDocumentTypes(orgId: string): Promise<DocumentType[]> {
  const { data } = await supabase
    .from('document_types')
    .select('*, category:categories(name)')
    .eq('org_id', orgId)
    .order('sort');
  return (data as DocumentType[]) ?? [];
}

export interface DocTypeInput {
  name: string;
  category_id: string | null;
  reference_format: string;
  publishable: boolean;
  allow_multiple: boolean;
  active: boolean;
  fields: FieldDef[];
}

export async function createDocumentType(orgId: string, input: DocTypeInput, sort: number): Promise<DocumentType> {
  const { data, error } = await supabase
    .from('document_types')
    .insert({ org_id: orgId, icon: 'doc', color: 'slate', sort, ...input })
    .select('*')
    .single();
  if (error) throw error;
  return data as DocumentType;
}

export async function updateDocumentType(id: string, patch: Partial<DocTypeInput>): Promise<void> {
  const { error } = await supabase.from('document_types').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteDocumentType(id: string): Promise<void> {
  const { error } = await supabase.from('document_types').delete().eq('id', id);
  if (error) throw error;
}

// ── Approval chain ───────────────────────────────────────────────────────────
export async function getChain(documentTypeId: string): Promise<ChainStep[]> {
  const { data } = await supabase
    .from('document_type_steps')
    .select('*, position:positions(name)')
    .eq('document_type_id', documentTypeId)
    .order('step_no');
  return (data as ChainStep[]) ?? [];
}

/** Replace the whole chain: delete existing steps, then insert positionIds in order. */
export async function setChain(orgId: string, documentTypeId: string, positionIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from('document_type_steps').delete().eq('document_type_id', documentTypeId);
  if (delErr) throw delErr;
  const clean = positionIds.filter(Boolean);
  if (!clean.length) return;
  const rows = clean.map((position_id, i) => ({ org_id: orgId, document_type_id: documentTypeId, step_no: i + 1, position_id }));
  const { error } = await supabase.from('document_type_steps').insert(rows);
  if (error) throw error;
}
