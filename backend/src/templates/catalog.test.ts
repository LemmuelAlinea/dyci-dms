import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './catalog.js';

describe('org-type catalog integrity', () => {
  for (const [key, tpl] of Object.entries(TEMPLATES)) {
    describe(key, () => {
      it('type matches its key', () => {
        expect(tpl.type).toBe(key);
      });
      it('every document type uses a declared category', () => {
        for (const dt of tpl.documentTypes) {
          expect(tpl.categories, `${dt.name} category`).toContain(dt.category);
        }
      });
      it('every approval step references a declared position', () => {
        for (const dt of tpl.documentTypes) {
          for (const pos of dt.chain) {
            expect(tpl.positions, `${dt.name} step`).toContain(pos);
          }
        }
      });
      it('dropdown fields have options', () => {
        for (const dt of tpl.documentTypes) {
          for (const f of dt.fields) {
            if (f.type === 'dropdown') expect(f.options?.length, `${dt.name}.${f.key}`).toBeGreaterThan(0);
          }
        }
      });
      it('reference format includes {seq}', () => {
        for (const dt of tpl.documentTypes) {
          expect(dt.referenceFormat, dt.name).toContain('{seq}');
        }
      });
    });
  }
});
