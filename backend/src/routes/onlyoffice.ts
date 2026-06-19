import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import { buildEditorConfig, decideAccess, signConfig, verifyCallbackToken } from '../lib/onlyoffice.js';

export const onlyofficeRouter = Router();

const BUCKET = 'documents';
const OFFICE_KINDS = ['docx', 'xlsx', 'pptx'];

const configSchema = z.object({ fileId: z.string().uuid() });

onlyofficeRouter.post('/config', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'fileId required' });
  const userId = req.user!.id;
  const { fileId } = parsed.data;

  try {
    const { data: file } = await supabaseAdmin
      .from('files')
      .select('id, org_id, owner_id, name, kind, mime, status, current_version, released_at')
      .eq('id', fileId)
      .single();
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (!OFFICE_KINDS.includes(file.kind)) return res.status(400).json({ error: 'Not an editable office file' });

    const [{ data: membership }, { data: share }] = await Promise.all([
      supabaseAdmin.from('organization_members').select('role').eq('org_id', file.org_id).eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('shares').select('permission, can_download').eq('target_type', 'file').eq('target_id', fileId).eq('shared_with_user_id', userId).maybeSingle(),
    ]);

    const access = decideAccess({
      isOwner: file.owner_id === userId,
      isOrgAdmin: membership?.role === 'admin',
      status: file.status,
      kind: file.kind,
      sharePermission: share?.permission ?? null,
      released: !!file.released_at,
    });
    if (access === 'none') return res.status(403).json({ error: 'You do not have access to this file' });

    const { data: version } = await supabaseAdmin
      .from('file_versions')
      .select('storage_path')
      .eq('file_id', fileId)
      .eq('version_no', file.current_version)
      .single();
    if (!version) return res.status(404).json({ error: 'Version not found' });

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(version.storage_path, 3600);
    if (signErr || !signed) return res.status(500).json({ error: 'Could not sign document URL' });

    const allowDownload = file.owner_id === userId || share?.can_download !== false;
    const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', userId).single();

    const config = buildEditorConfig({
      fileId,
      title: file.name,
      fileType: file.kind,
      documentUrl: signed.signedUrl,
      versionKey: `${fileId}-v${file.current_version}`,
      mode: access === 'edit' ? 'edit' : 'view',
      user: { id: userId, name: profile?.full_name ?? 'User' },
      callbackUrl: `${env.backendPublicUrl}/onlyoffice/callback?fileId=${fileId}&userId=${userId}`,
      allowDownload,
    });
    const token = signConfig(config);

    return res.json({
      config: { ...config, token },
      scriptUrl: `${env.onlyofficeUrl}/web-apps/apps/api/documents/api.js`,
      mode: config.editorConfig.mode,
    });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
});

const EXT_BY_KIND: Record<string, string> = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx' };

/**
 * Server-to-server callback from OnlyOffice. On status 2 (all editors closed,
 * changes present) or 6 (force-save) we download the edited file and store it as a
 * NEW version. Auth is the JWT in the body's `token` (or Authorization header).
 */
onlyofficeRouter.post('/callback', async (req, res) => {
  try {
    const token = (req.body?.token as string | undefined) ?? (req.headers.authorization ?? '').replace('Bearer ', '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: any;
    try {
      payload = verifyCallbackToken(token);
    } catch {
      return res.status(401).json({ error: 1 });
    }
    const status: number = payload.status ?? req.body.status;
    const downloadUrl: string | undefined = payload.url ?? req.body.url;
    const fileId = String(req.query.fileId ?? '');
    const userId = String(req.query.userId ?? '');

    if (status !== 2 && status !== 6) return res.json({ error: 0 });
    if (!downloadUrl || !fileId) return res.json({ error: 0 });

    const { data: file } = await supabaseAdmin
      .from('files')
      .select('id, org_id, owner_id, name, kind, status, current_version')
      .eq('id', fileId)
      .single();
    if (!file) return res.json({ error: 0 });

    if (file.status !== 'draft' && file.status !== 'rejected') {
      console.warn(`[onlyoffice] skipped save for ${fileId}: status is ${file.status}`);
      return res.json({ error: 0 });
    }

    const resp = await fetch(downloadUrl);
    if (!resp.ok) return res.json({ error: 0 });
    const buffer = Buffer.from(await resp.arrayBuffer());

    const next = file.current_version + 1;
    const ext = EXT_BY_KIND[file.kind] ?? 'bin';
    const path = `${file.org_id}/${file.owner_id}/${file.id}/v${next}.${ext}`;
    const contentType =
      file.kind === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : file.kind === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (upErr) return res.json({ error: 0 });

    await supabaseAdmin.from('file_versions').insert({
      file_id: file.id,
      version_no: next,
      storage_path: path,
      size_bytes: buffer.length,
      mime: contentType,
      uploaded_by: userId || file.owner_id,
      note: 'Edited in browser (OnlyOffice)',
    });
    await supabaseAdmin.from('files').update({ current_version: next, size_bytes: buffer.length, mime: contentType }).eq('id', file.id);
    await supabaseAdmin.from('activity_log').insert({
      org_id: file.org_id,
      actor_id: userId || file.owner_id,
      action: 'file.edited',
      entity: 'file',
      entity_id: file.id,
      meta: { version: next },
    });

    return res.json({ error: 0 });
  } catch (e) {
    console.error('[onlyoffice callback]', e);
    return res.json({ error: 0 });
  }
});
