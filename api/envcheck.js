// TEMPORARY diagnostic — reports which expected env vars are present at runtime
// (booleans only, never the values) plus the live commit SHA. Remove after debugging.
export default function handler(req, res) {
  const present = (k) => Boolean(process.env[k] && String(process.env[k]).trim());
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    SUPABASE_URL:               present('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY:  present('SUPABASE_SERVICE_ROLE_KEY'),
    DASHBOARD_PASSWORD:         present('DASHBOARD_PASSWORD'),
    DASHBOARD_SESSION_SECRET:   present('DASHBOARD_SESSION_SECRET'),
    node:    process.version,
    commit:  process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
}
