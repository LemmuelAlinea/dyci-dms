import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from './env.js';

// Node < 22 has no native WebSocket. supabase-js's realtime client needs one even
// though this server never uses realtime — polyfill it so createClient doesn't throw.
if (!(globalThis as { WebSocket?: unknown }).WebSocket) {
  (globalThis as { WebSocket?: unknown }).WebSocket = ws;
}

/**
 * Service-role client. Bypasses RLS — only ever used on the server after the
 * caller's identity + permissions have been verified in middleware/route logic.
 */
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Download a stored object as a Buffer (for email attachments / zipping). */
export async function downloadObject(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download failed: ${error?.message ?? 'no data'} (${path})`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
