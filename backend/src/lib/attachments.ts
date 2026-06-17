import archiver from 'archiver';
import { downloadObject, supabaseAdmin } from './supabaseAdmin.js';
import type { Attachment } from './brevo.js';

const MAX_TOTAL_BYTES = 18 * 1024 * 1024; // Brevo attachment ceiling (keep well under ~20MB)

interface FileRow {
  id: string;
  org_id: string;
  owner_id: string;
  name: string;
  current_version: number;
  size_bytes: number;
}

/** Verify the caller can access a file (owner, shared-with, released, or org admin). */
export async function canAccessFile(userId: string, file: FileRow): Promise<boolean> {
  if (file.owner_id === userId) return true;

  const { data: member } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', file.org_id)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!member) return false;
  if (member.role === 'admin') return true;

  const { data: share } = await supabaseAdmin
    .from('shares')
    .select('id')
    .eq('target_type', 'file')
    .eq('target_id', file.id)
    .eq('shared_with_user_id', userId)
    .maybeSingle();
  return Boolean(share);
}

/** Build base64 attachments for a set of file ids, enforcing access + size. */
export async function buildAttachments(userId: string, fileIds: string[]): Promise<Attachment[]> {
  const attachments: Attachment[] = [];
  let total = 0;

  for (const fileId of fileIds) {
    const { data: file } = await supabaseAdmin
      .from('files')
      .select('id, org_id, owner_id, name, current_version, size_bytes')
      .eq('id', fileId)
      .single();
    if (!file) throw new Error(`File not found: ${fileId}`);
    if (!(await canAccessFile(userId, file as FileRow))) {
      throw new Error(`You do not have access to file: ${file.name}`);
    }

    const { data: version } = await supabaseAdmin
      .from('file_versions')
      .select('storage_path, size_bytes')
      .eq('file_id', file.id)
      .eq('version_no', file.current_version)
      .single();
    if (!version) throw new Error(`No stored version for ${file.name}`);

    total += version.size_bytes ?? 0;
    if (total > MAX_TOTAL_BYTES) {
      throw new Error('Attachments exceed the 18MB email limit. Share an access link instead.');
    }

    const buf = await downloadObject('documents', version.storage_path);
    attachments.push({ name: file.name, content: buf.toString('base64') });
  }
  return attachments;
}

/** Zip every (non-trashed) file inside a folder into one attachment. */
export async function zipFolder(userId: string, folderId: string): Promise<Attachment> {
  const { data: folder } = await supabaseAdmin.from('folders').select('id, name, org_id').eq('id', folderId).single();
  if (!folder) throw new Error('Folder not found');

  const { data: files } = await supabaseAdmin
    .from('files')
    .select('id, org_id, owner_id, name, current_version, size_bytes')
    .eq('folder_id', folderId)
    .neq('state', 'trashed');

  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (c) => chunks.push(c as Buffer));

  const done = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', reject);
  });

  for (const file of files ?? []) {
    if (!(await canAccessFile(userId, file as FileRow))) continue;
    const { data: version } = await supabaseAdmin
      .from('file_versions')
      .select('storage_path')
      .eq('file_id', file.id)
      .eq('version_no', file.current_version)
      .single();
    if (!version) continue;
    const buf = await downloadObject('documents', version.storage_path);
    archive.append(buf, { name: file.name });
  }

  await archive.finalize();
  await done;
  return { name: `${folder.name}.zip`, content: Buffer.concat(chunks).toString('base64') };
}
