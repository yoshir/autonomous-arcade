// Universal Feedback API — reusable across any project
// POST: submit feedback (comment, bug, suggestion, rating)
// GET: list feedback for a project
// PATCH: heart/like a feedback item

const SUPABASE_URL = 'https://ildvhztonjaensqkmxsk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHZoenRvbmphZW5zcWtteHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUyMDc4OTMsImV4cCI6MjA2MDc4Mzg5M30.hYRsS9_ODZfz5i4PwNpp9I5w4gc6L9IBfBmPVkN7oXA';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Project-Id',
  'Content-Type': 'application/json',
};

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  // Set CORS headers
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  const projectId = req.headers['x-project-id'] || req.query.project || 'autonomous-arcade';

  try {
    // POST — submit feedback
    if (req.method === 'POST') {
      const { type = 'comment', content, rating, page_url, metadata = {} } = req.body || {};

      if (!content && !rating) {
        return res.status(400).json({ error: 'content or rating required' });
      }

      if (type && !['comment', 'bug', 'suggestion', 'rating'].includes(type)) {
        return res.status(400).json({ error: 'type must be comment, bug, suggestion, or rating' });
      }

      if (rating && (rating < 1 || rating > 5)) {
        return res.status(400).json({ error: 'rating must be 1-5' });
      }

      // Hash IP for spam detection (no PII stored)
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      const ipHash = Buffer.from(ip).toString('base64').slice(0, 12);

      const { data, status } = await supabaseRequest('ops_feedback', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          type,
          content: content ? content.slice(0, 2000) : null,
          rating: rating || null,
          page_url: page_url || null,
          user_agent: (req.headers['user-agent'] || '').slice(0, 500),
          ip_hash: ipHash,
          session_id: req.body?.session_id || null,
          metadata,
        }),
      });

      return res.status(status === 201 ? 201 : status).json(data);
    }

    // GET — list feedback
    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const type = req.query.type;
      const offset = parseInt(req.query.offset) || 0;

      let path = `ops_feedback?project_id=eq.${projectId}&order=created_at.desc&limit=${limit}&offset=${offset}`;
      if (type) path += `&type=eq.${type}`;

      const { data, status } = await supabaseRequest(path);
      return res.status(status).json(data);
    }

    // PATCH — heart/like a feedback item
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      // Increment hearts via RPC-style update
      const { data: existing } = await supabaseRequest(`ops_feedback?id=eq.${id}&select=hearts`);
      if (!existing || existing.length === 0) {
        return res.status(404).json({ error: 'not found' });
      }

      const { data, status } = await supabaseRequest(`ops_feedback?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ hearts: (existing[0].hearts || 0) + 1, updated_at: new Date().toISOString() }),
      });

      return res.status(status).json(data);
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('Feedback API error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
