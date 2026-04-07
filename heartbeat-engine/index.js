/**
 * Autonomous Arcade Heartbeat Engine — AI Edition
 *
 * Runs 4x/day via launchd/cron.
 * Each cycle:
 *   1. Pull new feedback since last run
 *   2. Evaluate against business-goals.md
 *   3. Make direct changes to game files
 *   4. Insert changelog entries (Supabase)
 *   5. Post summary to Slack
 *
 * Business goal: $50k MRR via AdSense
 * Growth lens: traffic ↑  retention ↑  monetization ↑
 */

import { createClient } from '@supabase/supabase-js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

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
  gamesDir: join(__dirname, '..', 'games'),
  businessGoalsPath: join(__dirname, '..', 'business-goals.md'),
  maxChangesPerCycle: 5,
  heartbeatHourInterval: 6, // 4x/day
};

// ─── Supabase client ────────────────────────────────────────────────────────────

const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);

// ─── State ─────────────────────────────────────────────────────────────────────

let lastRunAt = loadLastRun();
let runCount = 0;
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

// ─── Persistence ───────────────────────────────────────────────────────────────

function loadLastRun() {
  const f = join(CONFIG.gamesDir, '.last-heartbeat');
  try {
    if (existsSync(f)) return new Date(readFileSync(f, 'utf8').trim());
  } catch (_) {}
  // First run: look at last 24h
  const d = new Date();
  d.setHours(d.getHours() - 24);
  return d;
}

function saveLastRun() {
  const f = join(CONFIG.gamesDir, '.last-heartbeat');
  try {
    writeFileSync(f, new Date().toISOString());
  } catch (_) {}
}

// ─── Clawdbot Slack relay ──────────────────────────────────────────────────────

async function postToSlack(text, channelOverride) {
  const channel = channelOverride || CONFIG.slack.channelId;
  const cmd = [
    'clawdbot', 'message', 'send',
    '--channel', 'slack',
    '--target', `channel:${channel}`,
    '--message', JSON.stringify(text),
  ].join(' ');

  try {
    await execAsync(cmd, { timeout: 15_000 });
    info('Slack posted', { text: String(text).slice(0, 80) });
  } catch (e) {
    if (e.message.includes('ENOENT')) throw new Error('clawdbot CLI not found');
    throw e;
  }
}

// ─── Ollama / Gemma 4 ─────────────────────────────────────────────────────────

async function askGemma(prompt) {
  const res = await fetch(`${CONFIG.ollama.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.ollama.model,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 512 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.response || '(no response)').trim();
}

// ─── Business goals ───────────────────────────────────────────────────────────

function loadBusinessGoals() {
  try {
    return readFileSync(CONFIG.businessGoalsPath, 'utf8');
  } catch (e) {
    warn('Could not read business-goals.md', { error: e.message });
    return '';
  }
}

// ─── Load changelog ───────────────────────────────────────────────────────────

function getChangelogIcon(type) {
  return { bug_fix: '🐛', new_feature: '✨', improvement: '⚡', tweak: '🎮', deployment: '🚀' }[type] || '🚀';
}

async function insertChangelog({ gameSlug, gameId, icon, message, changeType }) {
  const { error } = await supabase
    .from('autonomous_arcade_changelog')
    .insert({
      game_slug:   gameSlug  || null,
      game_id:     gameId    || null,
      icon:        icon      || '🚀',
      message,
      change_type: changeType || 'improvement',
    });

  if (error) throw error;
  info('Changelog inserted', { gameSlug, message: message.slice(0, 60) });
}

// ─── Fetch unprocessed feedback ───────────────────────────────────────────────

async function fetchNewFeedback() {
  const { data, error } = await supabase
    .from('autonomous_arcade_feedback')
    .select(`
      id, type, content, rating, page_url, session_id, created_at,
      game:autonomous_arcade_games!game_id ( id, slug, title )
    `)
    .eq('ai_processed', false)
    .gt('created_at', lastRunAt.toISOString())
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) throw error;
  return data || [];
}

// ─── Mark feedback processed ──────────────────────────────────────────────────

async function markProcessed(id, decision) {
  const { error } = await supabase
    .from('autonomous_arcade_feedback')
    .update({
      ai_processed: true,
      ai_reply: decision,
      ai_reply_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

// ─── Get game files ───────────────────────────────────────────────────────────

function getGameFiles(slug) {
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new Error(`Path traversal rejected in getGameFiles: slug=${slug}`);
  }
  const dir = join(CONFIG.gamesDir, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.html') || f.endsWith('.js'));
}

// ─── Read game file ───────────────────────────────────────────────────────────

function readGameFile(slug, filename) {
  const path = sanitizePath(slug, filename);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

function sanitizePath(slug, filename) {
  // Reject path traversal sequences
  if (slug.includes('..') || filename.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new Error(`Path traversal rejected: slug=${slug}, file=${filename}`);
  }
  const resolved = join(CONFIG.gamesDir, slug, filename);
  // Ensure final path is within gamesDir (no traversal escape)
  if (!resolved.startsWith(CONFIG.gamesDir + sep)) {
    throw new Error(`Sandbox violation: ${resolved} outside ${CONFIG.gamesDir}`);
  }
  return resolved;
}

function writeGameFile(slug, filename, content) {
  const path = sanitizePath(slug, filename);
  writeFileSync(path, content, 'utf8');
  info('Wrote file', { slug, file: filename, size: content.length });
}

// ─── Gemma: evaluate feedback → decide what to change ─────────────────────────

async function evaluateFeedback(feedback, businessGoals) {
  const gameTitle = feedback.game?.title || feedback.game?.slug || 'the game';
  const typeLabel = { comment: 'comment', bug: 'bug report', suggestion: 'suggestion', rating: 'rating' }[feedback.type] || 'feedback';

  const prompt = `You are an AI operations agent for Autonomous Arcade — a browser game site that earns revenue via AdSense.

BUSINESS GOALS:
${businessGoals}

PLAYER FEEDBACK on "${gameTitle}":
- Type: ${typeLabel}
- Content: ${feedback.content || '(no text, rating only)'}
- Rating: ${feedback.rating ? `${feedback.rating}/5` : 'none'}

Your job: decide what to change. You have full code access to game files.

Respond ONLY with valid JSON (no markdown, no explanation outside the JSON):
{
  "decision": "change" | "ignore" | "note",
  "change_type": "bug_fix" | "improvement" | "tweak" | "new_feature" | null,
  "file": "index.html" | "game.js" | null,
  "change_summary": "one sentence describing what to change",
  "reasoning": "why this serves the $50k MRR goal"
}`;

  try {
    const reply = await askGemma(prompt);
    // Extract JSON from reply
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in Gemma response');
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    warn('Evaluation failed', { error: e.message, feedbackId: feedback.id });
    return { decision: 'ignore', reasoning: `Evaluation error: ${e.message}` };
  }
}

// ─── Gemma: implement a change ────────────────────────────────────────────────

async function implementChange(feedback, evaluation, businessGoals) {
  const slug = feedback.game?.slug;
  if (!slug || !evaluation.file) return null;

  const content = readGameFile(slug, evaluation.file);
  if (!content) return null;

  const gameTitle = feedback.game?.title || slug;

  const prompt = `You are an AI operations agent for Autonomous Arcade.

BUSINESS GOALS:
${businessGoals}

The player left this feedback on "${gameTitle}":
"${feedback.content || '(rating only)'}"

Your evaluation: ${evaluation.change_summary}

The game is in ${evaluation.file}. Here is the current content (excerpt):
${content.slice(0, 8000)}

Respond ONLY with valid JSON:
{
  "change": "replace" | "tweak" | "add" | null,
  "description": "what you actually changed (for the changelog, 1 sentence)",
  "new_code": "the full replacement content for the file (if replace), or the section to add (if add), or the exact tweak to make (if tweak)"
}

Rules:
- If "replace": include the full new file content in new_code
- If "tweak": describe in new_code exactly what to change and where (be surgical)
- Keep all existing functionality intact
- Make it better, not different for the sake of it`;

  try {
    const reply = await askGemma(prompt);
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in implementation response');
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    warn('Implementation failed', { error: e.message });
    return null;
  }
}

// ─── Main heartbeat cycle ──────────────────────────────────────────────────────

async function runHeartbeatCycle() {
  const cycleNum = runCount++;
  info(`=== Heartbeat cycle ${cycleNum} ===`);

  const businessGoals = loadBusinessGoals();
  if (!businessGoals) {
    warn('No business goals loaded, skipping');
    return;
  }

  const feedback = await fetchNewFeedback();
  if (!feedback.length) {
    info('No new feedback, skipping');
    return;
  }

  info(`Found ${feedback.length} new feedback items`);

  const changes = [];
  let changesMade = 0;

  for (const item of feedback) {
    if (changesMade >= CONFIG.maxChangesPerCycle) {
      info(`Max changes (${CONFIG.maxChangesPerCycle}) reached, skipping remaining`);
      break;
    }

    const evaluation = await evaluateFeedback(item, businessGoals);
    info(`Feedback ${item.id}: ${evaluation.decision}`, { reasoning: evaluation.reasoning });

    if (evaluation.decision === 'ignore') {
      await markProcessed(item.id, `Ignored: ${evaluation.reasoning}`);
      continue;
    }

    if (evaluation.decision === 'note') {
      await markProcessed(item.id, `Noted: ${evaluation.change_summary}`);
      await insertChangelog({
        gameSlug:  item.game?.slug || null,
        gameId:    item.game?.id    || null,
        icon:      '📝',
        message:   `Feedback reviewed: ${evaluation.change_summary}`,
        changeType: 'tweak',
      });
      continue;
    }

    // decision === 'change'
    if (evaluation.file) {
      const implementation = await implementChange(item, evaluation, businessGoals);
      if (implementation?.new_code && implementation?.description) {
        try {
          writeGameFile(item.game.slug, evaluation.file, implementation.new_code);
          await insertChangelog({
            gameSlug:  item.game.slug,
            gameId:    item.game.id,
            icon:      getChangelogIcon(evaluation.change_type),
            message:   implementation.description,
            changeType: evaluation.change_type || 'improvement',
          });
          changes.push({
            game: item.game?.title || item.game?.slug,
            summary: implementation.description,
            type: evaluation.change_type,
          });
          changesMade++;
          await markProcessed(item.id, `Changed: ${implementation.description}`);
        } catch (e) {
          error('Failed to write change', { error: e.message });
          await markProcessed(item.id, `Failed: ${e.message}`);
        }
      } else {
        await markProcessed(item.id, `Could not implement: ${evaluation.change_summary}`);
      }
    } else {
      await markProcessed(item.id, `No file change needed: ${evaluation.change_summary}`);
    }
  }

  // Post to Slack
  if (changes.length > 0) {
    const lines = changes.map(c => `• *${c.game}*: ${c.summary}`).join('\n');
    await postToSlack(
`*Autonomous Arcade — Heartbeat #${cycleNum}*\n${lines}\n_Changelogs posted to activity feed_`
    );
  } else {
    await postToSlack(`*Autonomous Arcade — Heartbeat #${cycleNum}* reviewed ${feedback.length} feedback items — no changes needed this cycle.`);
  }

  info(`Heartbeat #${cycleNum} done`, { changes: changes.length, feedback: feedback.length });
}

// ─── Periodic heartbeat (liveness) ───────────────────────────────────────────

async function postLiveness() {
  const uptime = Math.floor((Date.now() - startedAt) / 1000);
  const hrs = Math.floor(uptime / 3600);
  await postToSlack(
`*Autonomous Arcade Heartbeat* :heartbeat:\nUptime: ${hrs}h · Run #${runCount}`
  );
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main() {
  info('Heartbeat Engine starting', {
    model: CONFIG.ollama.model,
    gamesDir: CONFIG.gamesDir,
    lastRun: lastRunAt.toISOString(),
  });

  try {
    await postToSlack(`:robot_face: Autonomous Arcade Heartbeat Engine started. Running ${CONFIG.heartbeatHourInterval}h interval.`);
  } catch (e) {
    warn('Startup ping failed', { error: e.message });
  }

  await runHeartbeatCycle();
  saveLastRun();

  // Schedule next run
  const intervalMs = CONFIG.heartbeatHourInterval * 60 * 60 * 1000;
  setTimeout(async () => {
    await runHeartbeatCycle();
    saveLastRun();
    setInterval(runHeartbeatCycle, intervalMs);
  }, intervalMs);
}

main().catch(e => {
  error('Fatal', { error: e.message });
  process.exit(1);
});
