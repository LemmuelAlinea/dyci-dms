import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const filesRouter = Router();

const BUCKET = 'documents';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Pure: may this caller upload a new version of a file in this status? */
export function canUploadVersion(p: { isOwner: boolean; sharePermission: string | null; status: string }): boolean {
  const allowed = p.isOwner || p.sharePermission === 'edit';
  const editableStatus = p.status === 'draft' || p.status === 'rejected';
  return allowed && editableStatus;
}

filesRouter.post('/:fileId/version', requireAuth, upload.single('file'), async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const { fileId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { data: file } = await supabaseAdmin
      .from('files')
      .select('id, org_id, owner_id, name, kind, status, current_version')
      .eq('id', fileId)
      .single();
    if (!file) return res.status(404).json({ error: 'File not found' });

    const isOwner = file.owner_id === userId;
    let sharePermission: string | null = null;
    if (!isOwner) {
      const { data: share } = await supabaseAdmin
        .from('shares')
        .select('permission')
        .eq('target_type', 'file').eq('target_id', fileId).eq('shared_with_user_id', userId)
        .maybeSingle();
      sharePermission = share?.permission ?? null;
    }

    if (!(isOwner || sharePermission === 'edit')) {
      return res.status(403).json({ error: 'You do not have permission to upload a new version.' });
    }
    if (!canUploadVersion({ isOwner, sharePermission, status: file.status })) {
      return res.status(409).json({ error: 'New versions can only be uploaded while the document is a draft or was rejected.' });
    }

    const buffer = req.file.buffer;
    const next = file.current_version + 1;
    const origExt = req.file.originalname.split('.').pop();
    const ext = origExt && origExt.length <= 5 ? origExt.toLowerCase() : (file.kind || 'bin');
    const path = `${file.org_id}/${file.owner_id}/${file.id}/v${next}.${ext}`;
    const contentType = req.file.mimetype || 'application/octet-stream';

    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (upErr) {
      console.error('[files] storage upload failed for', fileId, 'v' + next, upErr.message);
      return res.status(500).json({ error: 'Upload failed' });
    }

    const { data: uploader } = await supabaseAdmin.from('profiles').select('full_name').eq('id', userId).single();
    const uploaderName = uploader?.full_name ?? 'Someone';

    const { error: versionErr } = await supabaseAdmin.from('file_versions').insert({
      file_id: file.id, version_no: next, storage_path: path, size_bytes: buffer.length,
      mime: contentType, uploaded_by: userId, note: `Uploaded by ${uploaderName}`,
    });
    if (versionErr) {
      // 23505 = unique_violation on (file_id, version_no): a concurrent upload won the race.
      if ((versionErr as { code?: string }).code === '23505') {
        console.error('[files] version race for', fileId, 'v' + next);
        return res.status(409).json({ error: 'Another version was just saved. Please reopen the file and try again.' });
      }
      console.error('[files] file_versions insert failed for', fileId, versionErr.message);
      return res.status(500).json({ error: 'Could not save the new version.' });
    }
    await supabaseAdmin.from('files').update({ current_version: next, size_bytes: buffer.length, mime: contentType }).eq('id', file.id);

    if (!isOwner) {
      await supabaseAdmin.from('notifications').insert({
        user_id: file.owner_id, type: 'version', title: 'New version uploaded',
        body: `${uploaderName} uploaded a new version of "${file.name}"`, link: `/app/file/${file.id}`,
      });
    }
    await supabaseAdmin.from('activity_log').insert({
      org_id: file.org_id, actor_id: userId, action: 'file.version_uploaded', entity: 'file', entity_id: file.id, meta: { version: next },
    });

    return res.json({ version: next });
  } catch (e) {
    console.error('[files] version upload error', e);
    return res.status(400).json({ error: 'Could not upload the new version.' });
  }
});
