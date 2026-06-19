import jwt from 'jsonwebtoken';
import { env } from './env.js';

export type AccessLevel = 'edit' | 'view' | 'none';

const EDITABLE_KINDS = ['docx', 'xlsx', 'pptx'];

/** Pure access decision used by the /onlyoffice/config gate. */
export function decideAccess(p: {
  isOwner: boolean;
  isOrgAdmin: boolean;
  status: string;
  kind: string;
  sharePermission: string | null;
  released: boolean;
}): AccessLevel {
  const editableKind = EDITABLE_KINDS.includes(p.kind);
  const editableStatus = p.status === 'draft' || p.status === 'rejected';
  if (editableKind && editableStatus && (p.isOwner || p.sharePermission === 'edit')) return 'edit';
  if (p.isOwner || p.isOrgAdmin || p.released || p.sharePermission != null) return 'view';
  return 'none';
}

export function docTypeFor(fileType: string): 'word' | 'cell' | 'slide' {
  if (fileType === 'xlsx') return 'cell';
  if (fileType === 'pptx') return 'slide';
  return 'word';
}

export interface EditorConfigParams {
  fileId: string;
  title: string;
  fileType: string;
  documentUrl: string;
  versionKey: string;
  mode: 'edit' | 'view';
  user: { id: string; name: string };
  callbackUrl: string;
  allowDownload: boolean;
}

export function buildEditorConfig(p: EditorConfigParams) {
  return {
    document: {
      fileType: p.fileType,
      key: p.versionKey,
      title: p.title,
      url: p.documentUrl,
      permissions: { download: p.allowDownload, print: p.allowDownload, edit: p.mode === 'edit' },
    },
    documentType: docTypeFor(p.fileType),
    editorConfig: {
      mode: p.mode,
      callbackUrl: p.callbackUrl,
      user: { id: p.user.id, name: p.user.name },
      customization: { forcesave: true, autosave: true },
    },
  };
}

export function signConfig(config: object, secret: string = env.onlyofficeJwtSecret): string {
  return jwt.sign(config, secret);
}

export function verifyCallbackToken(token: string, secret: string = env.onlyofficeJwtSecret): unknown {
  return jwt.verify(token, secret);
}
