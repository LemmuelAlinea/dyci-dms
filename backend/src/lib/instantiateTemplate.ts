import { supabaseAdmin } from './supabaseAdmin.js';
import { TEMPLATES } from '../templates/catalog.js';

/**
 * Copy an org-type template into a freshly created organization: positions,
 * categories, document types, and their ordered approval-chain steps.
 * Idempotent-ish: skips if the org already has categories.
 */
export async function instantiateTemplate(orgId: string, type: string): Promise<void> {
  const tpl = TEMPLATES[type] ?? TEMPLATES.general;

  const { count } = await supabaseAdmin
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);
  if ((count ?? 0) > 0) return; // already instantiated

  // Positions
  const positionRows = tpl.positions.map((name, i) => ({ org_id: orgId, name, sort: i }));
  const { data: positions } = await supabaseAdmin.from('positions').insert(positionRows).select('id, name');
  const posByName = new Map((positions ?? []).map((p) => [p.name, p.id]));

  // Categories
  const categoryRows = tpl.categories.map((name, i) => ({ org_id: orgId, name, sort: i }));
  const { data: categories } = await supabaseAdmin.from('categories').insert(categoryRows).select('id, name');
  const catByName = new Map((categories ?? []).map((c) => [c.name, c.id]));

  // Document types + steps
  let sort = 0;
  for (const dt of tpl.documentTypes) {
    const { data: created } = await supabaseAdmin
      .from('document_types')
      .insert({
        org_id: orgId,
        category_id: catByName.get(dt.category) ?? null,
        name: dt.name,
        icon: dt.icon,
        color: dt.color,
        reference_format: dt.referenceFormat,
        publishable: dt.publishable,
        fields: dt.fields,
        sort: sort++,
      })
      .select('id')
      .single();
    if (!created) continue;

    const steps = dt.chain
      .map((posName, idx) => ({ org_id: orgId, document_type_id: created.id, step_no: idx + 1, position_id: posByName.get(posName) }))
      .filter((s) => s.position_id);
    if (steps.length) await supabaseAdmin.from('document_type_steps').insert(steps);
  }
}
