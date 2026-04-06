/**
 * Autonomous Arcade — process-feedback Edge Function
 *
 * Receives pg_net webhook when new feedback is inserted into autonomous_arcade_feedback.
 * Runs Gemma via Ollama, posts AI reply to Slack, marks row ai_processed=true.
 *
 * pg_net calls: net.http_post(
 *   url := 'https://ildvhztonjaensqkmxsk.supabase.co/functions/v1/process-feedback',
 *   body := json_build_object('id', NEW.id, 'type', NEW.type, ...)
 * )
 */

import { createClient } from 'jsr:@supabase/supabase-js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')     ?? 'https://ildvhztonjaensqkmxsk.supabase.co';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OLLAMA_BASE_URL  = Deno.env.get('OLLAMA_BASE_URL')  ?? 'http://localhost:11434';
const OLLAMA_MODEL    = Deno.env.get('OLLAMA_MODEL')      ?? 'gemma4:31b';
const SLACK_CHANNEL   = Deno.env.get('SLACK_CHANNEL')      ?? 'C0AAX5Z85MG';

// ─── Owner Rules ────────────────────────────────────────────────────────────────
// These are injected into every Gemma prompt. Edit here to change AI behavior.
// Leave as empty string if no rules apply.
const OWNER_RULES = `
Owner rules:
- Only respond to feedback, never ask follow-up questions
- Never mention being an AI or reference internal systems
- Keep replies under 2 sentences
- If feedback is a bug report, be empathetic and apologize for the issue
`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Slack relay via clawdbot ──────────────────────────────────────────────────

async function postToSlack(text) {
  const cmd = [
    'clawdbot', 'message', 'send',
    '--channel', 'slack',
    '--target', `channel:${SLACK_CHANNEL}`,
    '--message', JSON.stringify(text),
  ].join(' ');

  try {
    await execAsync(cmd, { timeout: 15_000 });
  } catch (e) {
    if (e.message.includes('ENOENT')) {
      throw new Error('clawdbot CLI not found in PATH');
    }
    throw e;
  }
}

// ─── Ollama / Gemma ───────────────────────────────────────────────────────────

async function askGemma(prompt) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 256 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.response || '(no response)').trim();
}

function buildPrompt(item: {
  type: string;
  content: string | null;
  rating: number | null;
  page_url: string | null;
  game?: { title?: string; slug?: string } | null;
}): string {
  const gameTitle = item.game?.title || item.game?.slug || 'a game';
  const typeLabel = { comment: 'comment', bug: 'bug report', suggestion: 'suggestion', rating: 'rating' }[item.type] || 'feedback';

  const rules = OWNER_RULES.trim() ? `\n\n${OWNER_RULES.trim()}` : '';

  return `You are the AI curator for Autonomous Arcade — a site that publishes AI-built browser games every 2 hours.

A player left feedback on "${gameTitle}":
- Type: ${typeLabel}
- Content: ${item.content || '(no text, rating only)'}
- Rating: ${item.rating ? `${item.rating}/5` : 'none'}${rules}

Write a short, friendly reply (1-2 sentences max) as if you're a game developer responding to a player. Be warm but concise. No markdown, no emoji.

Reply:`;
}

// ─── Mark processed ────────────────────────────────────────────────────────────

async function markProcessed(id: string, aiReply: string) {
  const { error } = await supabase
    .from('autonomous_arcade_feedback')
    .update({ ai_processed: true, ai_reply: aiReply, ai_reply_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // pg_net sends the row data as JSON body
  const item = await req.json();

  if (!item?.id) {
    return new Response(JSON.stringify({ error: 'id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`Processing feedback ${item.id}`, { type: item.type });

  try {
    // Skip if already processed (edge case — pg_net might fire twice)
    const { data: existing } = await supabase
      .from('autonomous_arcade_feedback')
      .select('ai_processed')
      .eq('id', item.id)
      .single();

    if (existing?.ai_processed) {
      console.log(`Already processed ${item.id}, skipping`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt(item);
    const reply = await askGemma(prompt);

    const gameTitle = item.game?.title || item.game?.slug || item.page_url || 'game';
    const typeIcon  = { comment: '💬', bug: '🐛', suggestion: '💡', rating: '⭐' }[item.type] || '💬';
    const ratingStr = item.rating ? ` · ${'⭐'.repeat(item.rating)}` : '';

    const slackMsg =
`${typeIcon} *Feedback* — ${gameTitle}
*${item.type}*${ratingStr}
${item.content || '(rating only)'}

:robot-face: *AI reply:*
${reply}
_via pg_net + Gemma · <${item.page_url || 'link'}|source>_`;

    await postToSlack(slackMsg);
    await markProcessed(item.id, reply);

    console.log(`Done ${item.id}`);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`Error processing ${item.id}:`, err);

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
