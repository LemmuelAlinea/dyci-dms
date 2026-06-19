import { describe, it, expect } from 'vitest';
import { decideAccess, docTypeFor, buildEditorConfig, signConfig, verifyCallbackToken } from './onlyoffice.js';

describe('decideAccess', () => {
  const base = { isOwner: false, isOrgAdmin: false, status: 'draft', kind: 'docx', sharePermission: null as string | null, released: false };
  it('owner editing a draft docx -> edit', () => {
    expect(decideAccess({ ...base, isOwner: true })).toBe('edit');
  });
  it('edit-share on a draft xlsx -> edit', () => {
    expect(decideAccess({ ...base, kind: 'xlsx', sharePermission: 'edit' })).toBe('edit');
  });
  it('approved file is never edit -> view for owner', () => {
    expect(decideAccess({ ...base, isOwner: true, status: 'approved' })).toBe('view');
  });
  it('non-editable kind is never edit', () => {
    expect(decideAccess({ ...base, isOwner: true, kind: 'pdf' })).toBe('view');
  });
  it('view-share -> view', () => {
    expect(decideAccess({ ...base, sharePermission: 'view' })).toBe('view');
  });
  it('released file -> view for anyone', () => {
    expect(decideAccess({ ...base, status: 'released', released: true })).toBe('view');
  });
  it('stranger with no share/owner/admin -> none', () => {
    expect(decideAccess(base)).toBe('none');
  });
});

describe('docTypeFor', () => {
  it('maps office kinds', () => {
    expect(docTypeFor('xlsx')).toBe('cell');
    expect(docTypeFor('pptx')).toBe('slide');
    expect(docTypeFor('docx')).toBe('word');
  });
});

describe('buildEditorConfig', () => {
  it('builds an edit config', () => {
    const c = buildEditorConfig({
      fileId: 'f1', title: 'X.docx', fileType: 'docx', documentUrl: 'https://s/u',
      versionKey: 'f1-v2', mode: 'edit', user: { id: 'u1', name: 'Ana' },
      callbackUrl: 'https://b/cb', allowDownload: true,
    });
    expect(c.document.key).toBe('f1-v2');
    expect(c.documentType).toBe('word');
    expect(c.editorConfig.mode).toBe('edit');
    expect(c.document.permissions.edit).toBe(true);
  });
});

describe('signConfig/verifyCallbackToken', () => {
  it('round-trips with a secret', () => {
    const token = signConfig({ a: 1 }, 'secret');
    expect(verifyCallbackToken(token, 'secret')).toMatchObject({ a: 1 });
  });
  it('rejects a bad secret', () => {
    const token = signConfig({ a: 1 }, 'secret');
    expect(() => verifyCallbackToken(token, 'wrong')).toThrow();
  });
});
