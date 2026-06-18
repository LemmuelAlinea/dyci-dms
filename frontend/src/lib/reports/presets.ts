import { supabase } from '@/lib/supabase';

export interface ReportPreset {
  id: string;
  user_id: string;
  org_id: string | null;
  report_key: string;
  name: string;
  params: Record<string, unknown>;
  created_at: string;
}

export async function listPresets(reportKey: string, orgId: string | null): Promise<ReportPreset[]> {
  let q = supabase.from('report_presets').select('*').eq('report_key', reportKey).order('created_at');
  if (orgId) q = q.or(`org_id.eq.${orgId},org_id.is.null`);
  const { data } = await q;
  return (data as ReportPreset[]) ?? [];
}

export async function savePreset(reportKey: string, name: string, params: Record<string, unknown>, orgId: string | null): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { error } = await supabase.from('report_presets').insert({ user_id: userId, org_id: orgId, report_key: reportKey, name, params });
  if (error) throw error;
}

export async function deletePreset(id: string): Promise<void> {
  const { error } = await supabase.from('report_presets').delete().eq('id', id);
  if (error) throw error;
}
