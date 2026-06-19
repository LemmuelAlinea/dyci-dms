import { describe, it, expect } from 'vitest';
import { canUploadVersion } from './files.js';

describe('canUploadVersion', () => {
  const base = { isOwner: false, sharePermission: null as string | null, status: 'draft' };
  it('owner + draft -> true', () => expect(canUploadVersion({ ...base, isOwner: true })).toBe(true));
  it('owner + rejected -> true', () => expect(canUploadVersion({ ...base, isOwner: true, status: 'rejected' })).toBe(true));
  it('edit share + draft -> true', () => expect(canUploadVersion({ ...base, sharePermission: 'edit' })).toBe(true));
  it('download share -> false', () => expect(canUploadVersion({ ...base, sharePermission: 'download' })).toBe(false));
  it('view share -> false', () => expect(canUploadVersion({ ...base, sharePermission: 'view' })).toBe(false));
  it('no share/stranger -> false', () => expect(canUploadVersion(base)).toBe(false));
  it('owner + approved -> false', () => expect(canUploadVersion({ ...base, isOwner: true, status: 'approved' })).toBe(false));
  it('edit share + released -> false', () => expect(canUploadVersion({ ...base, sharePermission: 'edit', status: 'released' })).toBe(false));
});
