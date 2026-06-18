import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { instantiateTemplate } from '../lib/instantiateTemplate.js';

const run = async () => {
  const { data: orgs } = await supabaseAdmin.from('organizations').select('id, type');
  for (const o of orgs ?? []) {
    await instantiateTemplate(o.id, o.type ?? 'general');
    console.log('instantiated', o.id, o.type);
  }
  console.log('done');
};
void run();
