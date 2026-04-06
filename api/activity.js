// api/activity.js — serves changelog entries for the activity feed

const SUPABASE_URL    = 'https://ildvhztonjaensqkmxsk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHZoenRvbmphZW5zcWtteHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUyMDc4OTMsImV4cCI6MjA2MDc4Mzg5M30.hYRsS9_ODZfz5i4PwNpp9I5w4gc6L9IBfBmPVkN7oXA';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const gameSlug = req.query.game_slug || null;

  let path = `autonomous_arcade_changelog?order=created_at.desc&limit=${limit}`;
  if (gameSlug) {
    path += `&game_slug=eq.${gameSlug}`;
  }

  try {
    const res2 = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    const data = await res2.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Activity API error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
