import { supabase } from './supabase';
import { kindFromFile, randomId } from './utils';
import type { FileItem, FileVersion, Folder, NodeState } from './types';

const BUCKET = 'documents';

const OWNER = 'owner:profiles!files_owner_id_fkey(*)';
const APPROVER = 'approver:profiles!files_approved_by_fkey(*)';

function ext(name: string) {
  const e = name.split('.').pop();
  return e && e.length <= 5 ? e : 'bin';
}

// ── Listing ────────────────────────────────────────────────────────────────
export async function listFolders(orgId: string, ownerId: string, parentId: string | null): Promise<Folder[]> {
  let q = supabase
    .from('folders')
    .select('*')
    .eq('org_id', orgId)
    .eq('owner_id', ownerId)
    .eq('state', 'active')
    .order('name');
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Folder[]) ?? [];
}

export async function listFiles(orgId: string, ownerId: string, folderId: string | null): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select(`*, ${OWNER}, ${APPROVER}, document_type:document_types(publishable)`)
    .eq('org_id', orgId)
    .eq('owner_id', ownerId)
    .eq('state', 'active')
    .order('updated_at', { ascending: false });
  q = folderId ? q.eq('folder_id', folderId) : q.is('folder_id', null);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}

export async function listByState(orgId: string, ownerId: string, state: NodeState) {
  const [{ data: folders }, { data: files }] = await Promise.all([
    supabase.from('folders').select('*').eq('org_id', orgId).eq('owner_id', ownerId).eq('state', state).order('name'),
    supabase
      .from('files')
      .select(`*, ${OWNER}, ${APPROVER}`)
      .eq('org_id', orgId)
      .eq('owner_id', ownerId)
      .eq('state', state)
      .order('updated_at', { ascending: false }),
  ]);
  return { folders: (folders as Folder[]) ?? [], files: (files as FileItem[]) ?? [] };
}

export async function listReleased(orgId: string, search = ''): Promise<FileItem[]> {
  let q = supabase
    .from('files')
    .select(`*, ${OWNER}, ${APPROVER}`)
    .eq('org_id', orgId)
    .eq('status', 'released')
    .eq('state', 'active')
    .order('released_at', { ascending: false });
  if (search) q = q.ilike('name', `%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FileItem[]) ?? [];
}

export async function listSharedWithMe(userId: string): Promise<FileItem[]> {
  const { data: shares } = await supabase
    .from('shares')
    .select('target_id')
    .eq('target_type', 'file')
    .eq('shared_with_user_id', userId);
  const ids = (shares ?? []).map((s) => s.target_id);
  if (!ids.length) return [];
  const { data } = await supabase.from('files').select(`*, ${OWNER}, ${APPROVER}`).in('id', ids);
  return (data as FileItem[]) ?? [];
}

export async function searchEverything(orgId: string, term: string): Promise<{ files: FileItem[]; folders: Folder[] }> {
  if (!term.trim()) return { files: [], folders: [] };
  const [{ data: files }, { data: folders }] = await Promise.all([
    supabase
      .from('files')
      .select(`*, ${OWNER}, ${APPROVER}`)
      .eq('org_id', orgId)
      .ilike('name', `%${term}%`)
      .neq('state', 'trashed')
      .limit(40),
    supabase.from('folders').select('*').eq('org_id', orgId).ilike('name', `%${term}%`).neq('state', 'trashed').limit(20),
  ]);
  return { files: (files as FileItem[]) ?? [], folders: (folders as Folder[]) ?? [] };
}

// ── Mutations ────────────────────────────────────────────────────────────────
export async function createFolder(orgId: string, ownerId: string, parentId: string | null, name: string) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ org_id: orgId, owner_id: ownerId, parent_id: parentId, name })
    .select()
    .single();
  if (error) throw error;
  return data as Folder;
}

export interface UploadContext {
  documentTypeId?: string | null;
  categoryId?: string | null;
  referenceNo?: string | null;
  metadata?: Record<string, unknown>;
}

export async function uploadFile(
  orgId: string,
  ownerId: string,
  folderId: string | null,
  file: File,
  ctx?: UploadContext,
): Promise<FileItem> {
  const fileId = randomId();
  const path = `${orgId}/${ownerId}/${fileId}/v1.${ext(file.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  const kind = kindFromFile(file.name, file.type);
  const { data: row, error } = await supabase
    .from('files')
    .insert({
      id: fileId,
      org_id: orgId,
      owner_id: ownerId,
      folder_id: folderId,
      name: file.name,
      mime: file.type,
      kind,
      size_bytes: file.size,
      current_version: 1,
      status: 'draft',
      document_type_id: ctx?.documentTypeId ?? null,
      category_id: ctx?.categoryId ?? null,
      reference_no: ctx?.referenceNo ?? null,
      metadata: ctx?.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('file_versions').insert({
    file_id: fileId,
    version_no: 1,
    storage_path: path,
    size_bytes: file.size,
    mime: file.type,
    uploaded_by: ownerId,
    note: 'Initial upload',
  });
  return row as FileItem;
}

export async function uploadNewVersion(file: FileItem, blob: File, note?: string): Promise<void> {
  const next = file.current_version + 1;
  const path = `${file.org_id}/${file.owner_id}/${file.id}/v${next}.${ext(blob.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob);
  if (upErr) throw upErr;

  await supabase.from('file_versions').insert({
    file_id: file.id,
    version_no: next,
    storage_path: path,
    size_bytes: blob.size,
    mime: blob.type,
    uploaded_by: file.owner_id,
    note: note ?? `Version ${next}`,
  });
  await supabase
    .from('files')
    .update({ current_version: next, size_bytes: blob.size, mime: blob.type })
    .eq('id', file.id);
}

export async function listVersions(fileId: string): Promise<FileVersion[]> {
  const { data } = await supabase
    .from('file_versions')
    .select('*, uploader:profiles!file_versions_uploaded_by_fkey(*)')
    .eq('file_id', fileId)
    .order('version_no', { ascending: false });
  return (data as FileVersion[]) ?? [];
}

export async function signedUrlForVersion(fileId: string, versionNo: number, download = false): Promise<string> {
  const { data: v } = await supabase
    .from('file_versions')
    .select('storage_path')
    .eq('file_id', fileId)
    .eq('version_no', versionNo)
    .single();
  if (!v) throw new Error('Version not found');
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(v.storage_path, 600, download ? { download: true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

// ── State transitions: archive / bin / restore ──────────────────────────────
export async function setFileState(fileId: string, state: NodeState) {
  // The `files` table tracks lifecycle via `state` only (no archived_at/trashed_at
  // columns — those live on `folders`). Lists order by `updated_at`.
  const { error } = await supabase.from('files').update({ state }).eq('id', fileId);
  if (error) throw error;
}

export async function setFolderState(folderId: string, state: NodeState) {
  const { error } = await supabase.from('folders').update({ state }).eq('id', folderId);
  if (error) throw error;
}

export async function permanentlyDeleteFile(file: FileItem) {
  const { data: versions } = await supabase.from('file_versions').select('storage_path').eq('file_id', file.id);
  const paths = (versions ?? []).map((v) => v.storage_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from('files').delete().eq('id', file.id);
}

export async function renameFile(fileId: string, name: string) {
  await supabase.from('files').update({ name }).eq('id', fileId);
}
