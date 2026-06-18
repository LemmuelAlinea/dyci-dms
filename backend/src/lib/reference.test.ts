import { describe, expect, it } from 'vitest';
import { formatReference } from './reference.js';

describe('formatReference', () => {
  it('fills year and zero-padded sequence', () => {
    expect(formatReference('VCHR-{YYYY}-{seq}', 2026, 42)).toBe('VCHR-2026-0042');
  });
  it('pads to 4 digits and keeps larger numbers', () => {
    expect(formatReference('TOR-{YYYY}-{seq}', 2026, 7)).toBe('TOR-2026-0007');
    expect(formatReference('TOR-{YYYY}-{seq}', 2026, 12345)).toBe('TOR-2026-12345');
  });
  it('supports format without a year token', () => {
    expect(formatReference('DOC-{seq}', 2026, 3)).toBe('DOC-0003');
  });
});
