// Universal Feedback API — autonomous-arcade edition
// POST: submit feedback (comment, bug, suggestion, rating) + AI reply via local Ollama
// GET:  list feedback
// PATCH: heart/like a feedback item
//
// AI Reply flow:
//   Widget POSTs feedback → writes to Supabase → fires Ollama (non-blocking)
//   GET polls for ai_reply field → returns when ready
//
// Ollama served via Tailscale Funnel: https://ryans-macbook-pro-2.taila8cf65.ts.net

const SUPABASE_URL    = process.env.SUPABASE_URL || 'https://ildvhztonjaensqkmxsk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// ── Ollama config (Cloudflare Quick Tunnel — stable per session) ─────────────
// TODO: replace with named Cloudflare Tunnel (gemma.optimous.ai) when DNS ready
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'https://yesterday-subscriptions-innovative-orders.trycloudflare.com';
const OLLAMA_MODEL = 'gemma2:2b'; // fast model for real-time API responses (~2-5s)

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

// ── Sanitize AI reply (defense in depth — widget also escapes) ───────────────
function sanitizeAiReply(text) {
  if (!text) return null;
  // Strip any HTML tags, then limit length
  const stripped = text.replace(/<[^>]*>/g, '').trim();
  return stripped.slice(0, 500);
}

// ── Rate limit check (in-memory, per-deployment-instance) ──────────────────
const rateLimitMap = new Map(); // ipHash → [{ts, count}]

function checkRateLimit(ipHash, maxPerHour = 10) {
  const now = Date.now();
  const window = []; // rolling 1-hour window
  
  if (rateLimitMap.has(ipHash)) {
    const entries = rateLimitMap.get(ipHash);
    // Remove entries older than 1 hour
    const valid = entries.filter(e => now - e.ts < 3_600_000);
    rateLimitMap.set(ipHash, valid);
    if (valid.length >= maxPerHour) return false;
    valid.push({ ts: now });
  } else {
    rateLimitMap.set(ipHash, [{ ts: now }]);
  }
  return true;
}

// ── Ollama AI reply ────────────────────────────────────────────────────────────
async function generateAiReply(content, type, gameTitle) {
  const systemPrompt = `You are a friendly AI assistant for Autonomous Arcade (autonomous.arcade.optimous.ai).
Games are built by an AI that improves based on player feedback.
Keep replies SHORT (1-2 sentences), warm, and helpful.
Never mention being an AI model. Never be formal.`;

  const userPrompt = gameTitle
    ? `${type === 'bug' ? 'BUG REPORT' : type === 'suggestion' ? 'SUGGESTION' : type === 'rating' ? 'RATING' : 'FEEDBACK'} for "${gameTitle}":\n${content}`
    : `${type === 'bug' ? 'BUG REPORT' : type === 'suggestion' ? 'SUGGESTION' : type === 'rating' ? 'RATING' : 'FEEDBACK'}:\n${content}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
        options: { temperature: 0.7, num_predict: 150 }
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) {
      console.error('Ollama error:', response.status, await response.text());
      return null;
    }
    const result = await response.json();
    return result.response?.trim().slice(0, 500) || null;
  } catch (err) {
    console.error('Ollama error:', err.message);
    return null;
  }
}

// Update ai_reply in Supabase (fire-and-forget after feedback is written)
async function updateAiReply(feedbackId, aiReply) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/autonomous_arcade_feedback?id=eq.${feedbackId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ai_reply: aiReply,
        ai_reply_at: new Date().toISOString(),
        ai_processed: true,
      }),
    });
  } catch (err) {
    console.error('Failed to update ai_reply:', err.message);
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  const projectId = req.headers['x-project-id'] || req.query.project || 'autonomous-arcade';

  try {
    // ── POST — submit feedback + trigger AI reply ──────────────────────────────
    if (req.method === 'POST') {
      const {
        type     = 'comment',
        content,
        rating,
        game_id,
        page_url,
        session_id,
        metadata  = {},
        parent_id = null,
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

      const ip     = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      const ipHash = Buffer.from(ip).toString('base64').slice(0, 12);
      const ua     = (req.headers['user-agent'] || '').slice(0, 500);

      // Rate limit check (10 feedback/hr per IP hash)
      if (!checkRateLimit(ipHash)) {
        return res.status(429).json({ error: 'Too many submissions. Slow down!' });
      }

      // Look up game title if game_id provided
      let gameTitle = null;
      if (game_id) {
        const { data: games } = await supabaseRequest(
          `autonomous_arcade_games?id=eq.${game_id}&select=title`
        );
        gameTitle = games?.[0]?.title || null;
      }

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
        parent_id:    parent_id || null,
        ai_processed: false,
      };

      // Write to UUID-based table
      const newResult = await supabaseRequest('autonomous_arcade_feedback', {
        method: 'POST',
        body: JSON.stringify(row),
      });

      const newItem = Array.isArray(newResult.data) ? newResult.data[0] : null;

      // Also write to legacy table (non-fatal)
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
      }).catch(() => {});

      // Fire Ollama AI reply (non-blocking — doesn't delay response)
      if (newItem?.id && content) {
        generateAiReply(content, type, gameTitle).then(aiReply => {
          if (aiReply) updateAiReply(newItem.id, sanitizeAiReply(aiReply));
        });
      }

      return res.status(201).json(newResult.data);
    }

    // ── GET — list feedback ────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset  = parseInt(req.query.offset) || 0;
      const type    = req.query.type;
      const gameId  = req.query.game_id;
      const id      = req.query.id; // single item by ID (for polling)

      // Single item by ID (used by widget polling)
      if (id) {
        const { data, status } = await supabaseRequest(
          `autonomous_arcade_feedback?id=eq.${id}`
        );
        return res.status(status).json(data);
      }

      // Filtered by game_id
      if (gameId) {
        let path = `autonomous_arcade_feedback?game_id=eq.${gameId}&order=created_at.desc&limit=${limit}&offset=${offset}`;
        if (type) path += `&type=eq.${type}`;
        const { data, status } = await supabaseRequest(path);
        return res.status(status).json(data);
      }

      // All feedback
      let path = `autonomous_arcade_feedback?order=created_at.desc&limit=${limit}&offset=${offset}`;
      if (type) path += `&type=eq.${type}`;
      const { data, status } = await supabaseRequest(path);
      return res.status(status).json(data);
    }

    // ── PATCH — heart/like ────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

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
