// api/chat.js — Stateless Gemma 4 chat with per-game deep context
// Uses gemma4:31b for chat responses

const SUPABASE_URL    = process.env.SUPABASE_URL || 'https://ildvhztonjaensqkmxsk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://gemma1.optymi.com';
const OLLAMA_CHAT_MODEL = 'gemma4:31b';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function supabaseRequest(table, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res.json();
}

// Fetch game instructions — returns null if none exist
async function getGameInstructions(slug) {
  const { data } = await supabaseRequest(
    `autonomous_arcade_game_instructions?slug=eq.${encodeURIComponent(slug)}`
  );
  return data?.[0] || null;
}

// Generate instructions for a game using gemma4:31b
async function generateInstructions(slug, gameTitle) {
  const prompt = `You are writing a clear, concise "how to play" guide for the browser game "${gameTitle}" on Autonomous Arcade.

Generate a 3-5 paragraph guide covering:
1. What the game is and how to play it
2. Controls and mechanics
3. Scoring or win conditions
4. Any tips or strategies

Write in a friendly, helpful tone. Be specific about controls and gameplay.

Response format: just the guide text, no headers or labels.`;

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 512 },
      }),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return (data.response || '').trim();
  } catch (e) {
    console.error('Failed to generate instructions:', e.message);
    return null;
  }
}

// Save instructions to DB
async function saveInstructions(slug, instructions) {
  // First get game_id
  const { data: games } = await supabaseRequest(
    `autonomous_arcade_games?slug=eq.${encodeURIComponent(slug)}&select=id`
  );
  const gameId = games?.[0]?.id || null;

  await supabaseRequest('autonomous_arcade_game_instructions', {
    method: 'POST',
    body: JSON.stringify({
      slug,
      game_id: gameId,
      instructions,
      updated_at: new Date().toISOString(),
    }),
    headers: { prefer: 'return=minimal' },
  });
}

// Save a chat message to DB
async function saveMessage(sessionId, gameSlug, role, content) {
  await supabaseRequest('autonomous_arcade_chat_messages', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      game_slug: gameSlug,
      role,
      content,
    }),
    headers: { prefer: 'return=minimal' },
  });
}

// Build the system prompt with game-specific context
function buildSystemPrompt(gameInstructions, gameTitle, gameSlug) {
  const base = `You are an expert AI assistant for Autonomous Arcade (autonomous-arcade.optimous.ai) — a platform of AI-built browser games.

You help players understand games, answer questions about the platform, and provide game tips. Be friendly, concise, and helpful.`;

  if (gameInstructions) {
    return `${base}

You currently have deep context about the game "${gameTitle}":

${gameInstructions}

Use this context to answer the player's questions accurately. If they ask about how to play, refer to the guide above.`;
  } else if (gameSlug) {
    return `${base}

The player is asking about "${gameTitle}" (${gameSlug}). Be helpful and offer to explain the game.`;
  }

  return base;
}

// Ask Gemma 4 — stateless, includes full history
async function askGemma4(systemPrompt, history, newMessage) {
  // Build prompt from history + new message (Gemma2 doesn't support chat format, use generate)
  const conversation = history
    .map(m => `${m.role === 'player' ? 'Player' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `${systemPrompt}

Conversation:
${conversation}
Player: ${newMessage}
Assistant:`;

  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_CHAT_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.8, num_predict: 256 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.response || '(no response)').trim();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const { game_slug, session_id, message, history = [] } = req.body || {};

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message required' });
  }

  if (!session_id) {
    return res.status(400).json({ error: 'session_id required' });
  }

  try {
    // Resolve game title
    let gameTitle = game_slug || 'the platform';
    if (game_slug) {
      const { data: games } = await supabaseRequest(
        `autonomous_arcade_games?slug=eq.${encodeURIComponent(game_slug)}&select=title`
      );
      if (games?.[0]?.title) gameTitle = games[0].title;
    }

    // Get or generate instructions
    let instructions = null;
    let instructionsJustGenerated = false;
    if (game_slug) {
      let inst = await getGameInstructions(game_slug);
      if (!inst) {
        // Generate instructions for this game
        const generated = await generateInstructions(game_slug, gameTitle);
        if (generated) {
          await saveInstructions(game_slug, generated);
          instructions = generated;
          instructionsJustGenerated = true;
        }
      } else {
        instructions = inst.instructions;
      }
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(instructions, gameTitle, game_slug);

    // Generate AI response
    const reply = await askGemma4(systemPrompt, history, message);

    // Save messages to DB (non-blocking)
    saveMessage(session_id, game_slug || null, 'player', message).catch(() => {});
    saveMessage(session_id, game_slug || null, 'ai', reply).catch(() => {});

    return res.status(200).json({
      reply,
      instructionsGenerated: instructionsJustGenerated,
    });
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: 'chat failed: ' + err.message });
  }
}
