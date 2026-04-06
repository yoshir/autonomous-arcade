// Universal Feedback API — autonomous-arcade edition
// POST: submit feedback (comment, bug, suggestion, rating)
// GET:  list feedback
// PATCH: heart/like a feedback item
//
// Writes to autonomous_arcade_feedback (UUID-based, proper schema)
// Also writes to ops_feedback (legacy generic table, for backward compat)

const SUPABASE_URL    = 'https://ildvhztonjaensqkmxsk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHZoenRvbmphZW5zcWtteHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUyMDc4OTMsImV4cCI6MjA2MDc4Mzg5M30.hYRsS9_ODZfz5i4PwNpp9I5w4gc6L9IBfBmPVkN7oXA';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Project-Id',
  'Content-Type': 'application/json',
};

async function supabaseRequest(table, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const data = await res.json();
  return { data, status: res.status };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  const projectId = req.headers['x-project-id'] || req.query.project || 'autonomous-arcade';

  try {
    // ── POST — submit feedback ────────────────────────────────────────────────
    if (req.method === 'POST') {
      const {
        type     = 'comment',
        content,
        rating,
        game_id,    // UUID of the game (autonomous-arcade-games table)
        page_url,
        session_id,
        metadata  = {},
      } = req.body || {};

      if (!content && !rating) {
        return res.status(400).json({ error: 'content or rating required' });
      }

      if (!['comment', 'bug', 'suggestion', 'rating'].includes(type)) {
        return res.status(400).json({ error: 'type must be comment, bug, suggestion, or rating' });
      }

      if (rating && (rating < 1 || rating > 5)) {
        return res.status(400).json({ error: 'rating must be 1-5' });
      }

      // IP hash for spam detection (no PII)
      const ip     = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      const ipHash = Buffer.from(ip).toString('base64').slice(0, 12);
      const ua     = (req.headers['user-agent'] || '').slice(0, 500);

      const row = {
        type,
        content:      content ? content.slice(0, 2000) : null,
        rating:       rating || null,
        game_id:      game_id || null,
        page_url:     page_url || null,
        session_id:   session_id || null,
        ip_hash:      ipHash,
        user_agent:   ua,
        metadata,
      };

      // Write to new UUID-based table
      const newResult = await supabaseRequest('autonomous_arcade_feedback', {
        method: 'POST',
        body: JSON.stringify(row),
      });

      // Also write to legacy table for backward compat
      await supabaseRequest('ops_feedback', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          type,
          content:  content ? content.slice(0, 2000) : null,
          rating:   rating || null,
          page_url: page_url || null,
          user_agent: ua,
          ip_hash:  ipHash,
          session_id: session_id || null,
          metadata,
        }),
      }).catch(() => {}); // non-fatal if legacy table write fails

      return res.status(201).json(newResult.data);
    }

    // ── GET — list feedback ────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset  = parseInt(req.query.offset) || 0;
      const type    = req.query.type;
      const gameId  = req.query.game_id;

      // Use new UUID-based table when game_id is provided
      if (gameId) {
        let path = `autonomous_arcade_feedback?game_id=eq.${gameId}&order=created_at.desc&limit=${limit}&offset=${offset}`;
        if (type) path += `&type=eq.${type}`;
        const { data, status } = await supabaseRequest(path);
        return res.status(status).json(data);
      }

      // Fall back to new table (all autonomous-arcade feedback)
      let path = `autonomous_arcade_feedback?order=created_at.desc&limit=${limit}&offset=${offset}`;
      if (type) path += `&type=eq.${type}`;
      const { data, status } = await supabaseRequest(path);
      return res.status(status).json(data);
    }

    // ── PATCH — heart/like ─────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      // Try new table first, then legacy
      for (const table of ['autonomous_arcade_feedback', 'ops_feedback']) {
        const { data: existing } = await supabaseRequest(`${table}?id=eq.${id}&select=hearts`);
        if (existing && existing.length > 0) {
          const { data, status } = await supabaseRequest(`${table}?id=eq.${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              hearts: (existing[0].hearts || 0) + 1,
              updated_at: new Date().toISOString(),
            }),
          });
          return res.status(status).json(data);
        }
      }

      return res.status(404).json({ error: 'not found' });
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (err) {
    console.error('Feedback API error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
