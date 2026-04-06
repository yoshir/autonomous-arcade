/**
 * Autonomous Arcade Heartbeat Engine
 *
 * Polls Supabase for unprocessed feedback from the autonomous_arcade_feedback table.
 * Runs each item through Gemma via local ollama.
 * Posts AI replies to Slack via Clawdbot (clawdbot message send).
 *
 * Lives: ~/sym-dropbox/_dev/autonomous-arcade/heartbeat-engine/
 * Run:   npm start
 *
 * Requirements:
 *   - ollama serve (ollama serve)
 *   - gemma:latest model pulled (ollama pull gemma:7b)
 *   - Clawdbot running with Slack configured
 *   - Supabase: run MIGRATION.sql first
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// ─── Config ────────────────────────────────────────────────────────────────────

const CONFIG = {
  supabase: {
    url: 'https://ildvhztonjaensqkmxsk.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsZHZoenRvbmphZW5zcWtteHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUyMDc4OTMsImV4cCI6MjA2MDc4Mzg5M30.hYRsS9_ODZfz5i4PwNpp9I5w4gc6L9IBfBmPVkN7oXA',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'gemma4:31b',
  },
  slack: {
    channelId: 'C0AAX5Z85MG', // #yosh-optimous-ops
  },
  pollIntervalMs: 30_000,
  maxRetries: 3,
  retryDelayMs: 5_000,
};

// ─── Supabase client ────────────────────────────────────────────────────────────

const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

// ─── State ─────────────────────────────────────────────────────────────────────

let consecutiveErrors = 0;
let lastPollAt = null;
let processedCount = 0;
let startedAt = Date.now();

// ─── Logging ───────────────────────────────────────────────────────────────────

function log(level, msg, meta = {}) {
  const ts = new Date().toISOString().slice(11, 23);
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [${level.toUpperCase()}] ${msg}${metaStr}`);
}

const info  = (msg, m) => log('info', msg, m);
const warn  = (msg, m) => log('warn', msg, m);
const error = (msg, m) => log('error', msg, m);

// ─── Clawdbot Slack relay ──────────────────────────────────────────────────────

async function postToSlack(text, channelOverride) {
  const channel = channelOverride || CONFIG.slack.channelId;
  const target = `channel:${channel}`;
  const cmd = [
    'clawdbot', 'message', 'send',
    '--channel', 'slack',
    '--target', target,
    '--message', JSON.stringify(text),
  ].join(' ');

  try {
    await execAsync(cmd, { timeout: 15_000 });
    info('Slack posted', { text: String(text).slice(0, 80) });
  } catch (e) {
    if (e.message.includes('ENOENT')) {
      throw new Error('clawdbot CLI not found in PATH');
    }
    throw e;
  }
}

// ─── Periodic heartbeat ───────────────────────────────────────────────────────

async function postHeartbeat() {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  const hrs = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  await postToSlack(
`*Autonomous Arcade Heartbeat* :heartbeat:
_Uptime: ${hrs}h ${mins}m | Processed: ${processedCount} | Consecutive errors: ${consecutiveErrors}_
Last poll: ${lastPollAt ? new Date(lastPollAt).toLocaleTimeString() : 'never'} · Heap: ${mem}MB · Model: ${CONFIG.ollama.model}`
  );
}

// ─── Ollama / Gemma ───────────────────────────────────────────────────────────

async function askGemma(prompt) {
  const res = await fetch(`${CONFIG.ollama.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.ollama.model,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 256 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.response || '(no response)').trim();
}

function buildPrompt(feedback) {
  const gameTitle = feedback.game?.title || feedback.game?.slug || 'a game';
  const typeLabel = { comment: 'comment', bug: 'bug report', suggestion: 'suggestion', rating: 'rating' }[feedback.type] || 'feedback';

  return `You are the AI curator for Autonomous Arcade — a site that publishes AI-built browser games every 2 hours.

A player left feedback on "${gameTitle}":
- Type: ${typeLabel}
- Content: ${feedback.content || '(no text, rating only)'}
- Rating: ${feedback.rating ? `${feedback.rating}/5` : 'none'}

Write a short, friendly reply (1-2 sentences max) as if you're a game developer responding to a player. Be warm but concise. No markdown, no emoji.

Reply:`;
}

// ─── Mark processed ────────────────────────────────────────────────────────────

async function markProcessed(id, aiReply) {
  const { error } = await supabase
    .from('autonomous_arcade_feedback')
    .update({ ai_processed: true, ai_reply: aiReply, ai_reply_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// ─── Process one feedback item ─────────────────────────────────────────────────

async function processItem(item) {
  info(`Processing ${item.id}`, { type: item.type, game: item.game?.slug });

  const prompt = buildPrompt(item);

  let reply;
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      reply = await askGemma(prompt);
      break;
    } catch (e) {
      warn(`Ollama attempt ${attempt} failed`, { error: e.message });
      if (attempt < CONFIG.maxRetries) await sleep(CONFIG.retryDelayMs);
      else reply = `⚠️ AI error after ${CONFIG.maxRetries} attempts: ${e.message}`;
    }
  }

  const gameTitle = item.game?.title || item.game?.slug || item.page_url || 'game';
  const typeIcon  = { comment: '💬', bug: '🐛', suggestion: '💡', rating: '⭐' }[item.type] || '💬';
  const ratingStr = item.rating ? ` · ${'⭐'.repeat(item.rating)}` : '';

  const slackMsg =
`${typeIcon} *Feedback* — ${gameTitle}
*${item.type}*${ratingStr}
${item.content || '(rating only)'}

:robot-face: *AI reply:*
${reply}
_via Gemma · <${item.page_url || 'link'}|source>_`;

  try {
    await postToSlack(slackMsg);
    await markProcessed(item.id, reply);
    processedCount++;
    consecutiveErrors = 0;
    info(`✓ Done ${item.id}`, { reply: reply.slice(0, 60) });
  } catch (e) {
    error(`Failed to post/mark ${item.id}`, { error: e.message });
    consecutiveErrors++;
    throw e;
  }
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

async function poll() {
  lastPollAt = Date.now();

  // JOIN feedback with game registry to get game title/slug
  const { data, error } = await supabase
    .from('autonomous_arcade_feedback')
    .select(`
      id, type, content, rating, page_url, session_id, created_at,
      game:autonomous_arcade_games!game_id ( id, slug, title )
    `)
    .eq('ai_processed', false)
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) {
    error('Poll failed', { error: error.message });
    consecutiveErrors++;
    return;
  }

  if (!data || data.length === 0) {
    info('No new feedback, sleeping');
    return;
  }

  info(`Found ${data.length} unprocessed`);

  for (const item of data) {
    try {
      await processItem(item);
    } catch (e) {
      error(`Error processing ${item.id}`, { error: e.message });
      consecutiveErrors++;
    }
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  info(`Received ${signal}, shutting down...`);
  try {
    await postToSlack(`:warning: Autonomous Arcade Heartbeat stopped (${signal}).`);
  } catch (_) {}
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main() {
  info('Autonomous Arcade Heartbeat Engine starting', {
    model: CONFIG.ollama.model,
    pollInterval: `${CONFIG.pollIntervalMs / 1000}s`,
    relay: 'clawdbot message send',
    mode: 'slack-heartbeat-only',
    note: 'Feedback AI processing moved to pg_net + Edge Function',
  });

  // Verify ollama
  try {
    const res = await fetch(`${CONFIG.ollama.baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    const hasModel = data.models?.some(m => m.name.includes('gemma'));
    if (!hasModel) warn('gemma model not found. Run: ollama pull gemma:7b');
    else info('Ollama OK', { model: CONFIG.ollama.model });
  } catch (e) {
    error('Ollama not reachable', { error: e.message });
    info('Start ollama: ollama serve');
  }

  // Startup ping
  try {
    await postToSlack(`:rocket: Autonomous Arcade Heartbeat started. Polling every 30s.`);
  } catch (e) {
    warn('Could not post startup message', { error: e.message });
  }

  // Heartbeat-only loop: post Slack status every 30s
  // (does not hit Supabase — pg_net handles feedback processing)
  while (!shuttingDown) {
    await sleep(CONFIG.pollIntervalMs);
    await postHeartbeat();
  }
}

main().catch(e => { error('Fatal', { error: e.message }); process.exit(1); });
