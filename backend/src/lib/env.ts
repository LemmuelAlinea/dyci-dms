import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.warn(`[env] Missing ${name} — related features will fail until it is set.`);
    return '';
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  frontendOrigins: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  backendPublicUrl: process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8787}`,
  onlyofficeUrl: process.env.ONLYOFFICE_URL ?? '',
  onlyofficeJwtSecret: process.env.ONLYOFFICE_JWT_SECRET ?? '',
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  brevoApiKey: required('BREVO_API_KEY'),
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL ?? 'no-reply@example.com',
  brevoSenderName: process.env.BREVO_SENDER_NAME ?? 'DYCI Document Management System',
};
