/**
 * Autonomous Arcade — Embeddable Feedback Widget
 *
 * Drop this on ANY site to get comments, ratings, bug reports, and likes.
 *
 * Usage (Autonomous Arcade games):
 *   <div id="aa-feedback"></div>
 *   <script src="/feedback-widget.js"
 *           data-game-id="00000000-0000-0000-0000-000000000000"
 *           data-project="autonomous-arcade"
 *           data-api="/api/feedback">
 *   </script>
 *
 * Legacy (slug-based, deprecated):
 *   <div id="aa-feedback"></div>
 *   <script src="/feedback-widget.js"
 *           data-project="pulse-run"
 *           data-api="/api/feedback">
 *   </script>
 */
(function() {
  'use strict';

  // Config from script tag
  const scriptTag = document.currentScript;
  const API = scriptTag?.getAttribute('data-api') || '/api/feedback';
  const PROJECT = scriptTag?.getAttribute('data-project') || 'autonomous-arcade';
  const GAME_ID = scriptTag?.getAttribute('data-game-id') || null; // UUID of the game
  const CONTAINER = scriptTag?.getAttribute('data-container') || 'aa-feedback';
  const THEME = scriptTag?.getAttribute('data-theme') || 'dark';

  // Session ID (persistent per browser)
  let sessionId = localStorage.getItem('aa_sid');
  if (!sessionId) {
    sessionId = 'aa_' + Math.random().toString(36).substr(2, 12);
    localStorage.setItem('aa_sid', sessionId);
  }

  // Styles
  const isDark = THEME === 'dark';
  const colors = {
    bg: isDark ? '#0a0a1f' : '#f8f9fa',
    border: isDark ? 'rgba(0,240,255,0.1)' : '#e0e0e0',
    text: isDark ? '#ccd' : '#333',
    muted: isDark ? '#556' : '#888',
    accent: '#ff00aa',
    accentHover: '#cc0088',
    cyan: '#00f0ff',
    cardBg: isDark ? 'rgba(255,255,255,0.02)' : '#fff',
    inputBg: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
    inputBorder: isDark ? 'rgba(255,255,255,0.08)' : '#ddd',
  };

  const css = `
    .aafw { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 100%; }
    .aafw * { box-sizing: border-box; margin: 0; padding: 0; }

    /* Tabs */
    .aafw-tabs { display: flex; gap: 4px; margin-bottom: 20px; }
    .aafw-tab {
      padding: 8px 16px; border-radius: 10px; border: 1px solid ${colors.border};
      background: transparent; color: ${colors.muted}; cursor: pointer;
      font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;
      transition: all 0.2s;
    }
    .aafw-tab:hover { border-color: ${colors.accent}; color: ${colors.text}; }
    .aafw-tab.active { background: ${colors.accent}; border-color: ${colors.accent}; color: #fff; }

    /* Form */
    .aafw-form { margin-bottom: 24px; }
    .aafw-rating { display: flex; gap: 8px; margin-bottom: 12px; }
    .aafw-star {
      background: none; border: 2px solid ${colors.inputBorder}; border-radius: 10px;
      padding: 6px 12px; font-size: 20px; cursor: pointer; transition: all 0.2s;
    }
    .aafw-star:hover, .aafw-star.active { border-color: ${colors.accent}; background: rgba(255,0,170,0.1); transform: scale(1.1); }

    .aafw-input {
      width: 100%; background: ${colors.inputBg}; border: 1px solid ${colors.inputBorder};
      border-radius: 10px; padding: 12px 14px; color: ${colors.text}; font-size: 14px;
      font-family: inherit; resize: vertical; min-height: 60px; outline: none;
      transition: border-color 0.2s;
    }
    .aafw-input::placeholder { color: ${colors.muted}; }
    .aafw-input:focus { border-color: ${colors.cyan}; }

    .aafw-submit {
      margin-top: 10px; background: linear-gradient(135deg, ${colors.accent}, ${colors.accentHover});
      color: #fff; border: none; padding: 10px 24px; border-radius: 10px;
      font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      cursor: pointer; transition: all 0.2s;
    }
    .aafw-submit:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(255,0,170,0.3); }
    .aafw-submit:disabled { opacity: 0.3; cursor: default; transform: none; }

    /* Feed */
    .aafw-feed { display: flex; flex-direction: column; gap: 12px; }
    /* Feed — compact LinkedIn density */
    .aafw-feed { display: flex; flex-direction: column; gap: 8px; }
    .aafw-item {
      background: ${colors.cardBg}; border: 1px solid ${colors.border}; border-radius: 10px;
      padding: 10px 14px; transition: border-color 0.2s;
    }
    .aafw-item:hover { border-color: rgba(0,240,255,0.15); }

    /* Single-line header: type-dot · time · [optional rating emoji] */
    .aafw-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
    .aafw-item-type-dot {
      display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
    }
    .aafw-type-dot-comment { background: ${colors.cyan}; }
    .aafw-type-dot-bug { background: #ff4444; }
    .aafw-type-dot-suggestion { background: #44cc44; }
    .aafw-type-dot-rating { background: #ffcc00; }
    .aafw-item-type-label {
      font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
      color: ${colors.muted};
    }
    .aafw-item-time { font-size: 11px; color: ${colors.muted}; }
    .aafw-item-sep { color: ${colors.border}; font-size: 11px; }
    .aafw-item-rating { font-size: 13px; }

    .aafw-item-content { color: ${colors.text}; font-size: 13px; line-height: 1.5; }
    .aafw-item-footer { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
    .aafw-heart {
      background: none; border: none; color: ${colors.muted}; cursor: pointer;
      font-size: 12px; display: flex; align-items: center; gap: 3px; transition: color 0.2s;
      padding: 2px 0;
    }
    .aafw-heart:hover { color: ${colors.accent}; }
    .aafw-heart.hearted { color: ${colors.accent}; }

    .aafw-empty { text-align: center; color: ${colors.muted}; padding: 24px 0; font-size: 13px; }
    .aafw-msg { padding: 8px 0; font-size: 13px; font-weight: 600; }
    .aafw-msg.success { color: ${colors.cyan}; }
    .aafw-msg.error { color: #ff4444; }
    .aafw-page-url { font-size: 11px; color: ${colors.muted}; word-break: break-all; }

    /* AI Reply — chat bubble style */
    .aafw-ai-reply {
      margin-top: 8px; padding: 10px 12px; border-radius: 10px;
      background: rgba(0,240,255,0.06); border: 1px solid rgba(0,240,255,0.12);
      font-size: 13px; line-height: 1.5; color: ${colors.text};
      display: flex; gap: 10px; align-items: flex-start;
    }
    .aafw-ai-avatar {
      width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, ${colors.cyan}, ${colors.accent});
      display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;
    }
    .aafw-ai-body { flex: 1; min-width: 0; }
    .aafw-ai-name { font-size: 11px; font-weight: 700; color: ${colors.cyan}; margin-bottom: 4px; letter-spacing: 0.5px; }
    .aafw-ai-text { color: ${colors.text}; }
    .aafw-ai-thinking {
      margin-top: 8px; display: flex; gap: 10px; align-items: center;
      padding: 10px 12px; border-radius: 10px;
      background: rgba(0,240,255,0.04); border: 1px solid rgba(0,240,255,0.08);
      font-size: 12px; color: ${colors.muted};
    }
    .aafw-ai-thinking-dots::after { content: ''; animation: aafw-dots 1.5s infinite; }
    @keyframes aafw-dots { 0%,20%{content:'.'} 40%{content:'..'} 60%,100%{content:'...'} }
    .aafw-typing-dot {
      width: 6px; height: 6px; border-radius: 50%; background: ${colors.cyan}; flex-shrink: 0;
      animation: aafw-typing-bounce 1.2s infinite;
    }
    .aafw-typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .aafw-typing-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes aafw-typing-bounce {
      0%,60%,100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }
  `;

  // Helpers
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }

  const ratingEmojis = ['😴','😐','🙂','😄','🤩'];
  function ratingStars(n) { return ratingEmojis.slice(0, n).join(''); }

  const typeLabels = { comment: 'Comment', bug: 'Bug', suggestion: 'Idea', rating: 'Rating' };
  const placeholders = {
    comment: 'Ask Gemma anything about Autonomous Arcade...',
    bug: 'What went wrong? Steps to reproduce...',
    suggestion: 'What would make this better?',
    rating: 'Optional: tell us more about your rating...',
  };

  // Debug event bus (for debug sidebar)
  function emitDebug(type, data) {
    try {
      window.dispatchEvent(new CustomEvent('aa-debug', { detail: { type, data, ts: Date.now() } }));
    } catch(e) {}
  }

  // State
  let currentType = 'comment';
  let currentRating = 0;
  let feedItems = [];
  let hearted = JSON.parse(localStorage.getItem('aa_hearted') || '{}');
  let pendingAiReplyId = null; // ID of the just-submitted item waiting for AI reply
  let pollInterval = null;

  // API calls
  async function apiFetch(method, params = {}) {
    const url = new URL(API, window.location.origin);
    url.searchParams.set('project', PROJECT);
    Object.entries(params.query || {}).forEach(([k,v]) => url.searchParams.set(k, v));

    const opts = { method, headers: { 'Content-Type': 'application/json', 'X-Project-Id': PROJECT } };
    if (params.body) opts.body = JSON.stringify(params.body);

    const res = await fetch(url, opts);
    return res.json();
  }

  async function loadFeed(type) {
    const query = { limit: '30' };
    if (type && type !== 'all') query.type = type;
    emitDebug('api-call', { method: 'GET', endpoint: API, params: query });
    try {
      feedItems = await apiFetch('GET', { query });
      emitDebug('api-response', { method: 'GET', endpoint: API, count: feedItems?.length });
      renderFeed();
    } catch(e) {
      emitDebug('error', { context: 'loadFeed', message: e.message });
    }
  }

  async function submitFeedback(type, content, rating) {
    emitDebug('feedback-submit', { type, hasContent: !!content, hasRating: !!rating });
    const result = await apiFetch('POST', {
      body: {
        type,
        content: content || null,
        rating: rating || null,
        game_id: GAME_ID || null,
        page_url: location.href,
        session_id: sessionId,
      }
    });
    emitDebug('feedback-submitted', { type, resultId: result?.[0]?.id });
    return result;
  }

  async function heartItem(id) {
    return apiFetch('PATCH', { query: { id } });
  }

  // Poll for AI reply on a specific item
  function startAiReplyPoll(itemId) {
    if (pollInterval) clearInterval(pollInterval);

    const MAX_POLLS = 30; // 30 × 2s = 60s max wait
    let polls = 0;

    emitDebug('ai-poll-start', { itemId });

    pollInterval = setInterval(async () => {
      polls++;
      try {
        emitDebug('ai-poll-check', { itemId, poll: polls });
        const items = await apiFetch('GET', { query: { id: itemId, limit: 1 } });
        const item = Array.isArray(items) ? items[0] : null;

        if (item?.ai_reply) {
          clearInterval(pollInterval);
          pollInterval = null;
          pendingAiReplyId = null;
          emitDebug('ai-reply-received', { itemId, reply: item.ai_reply.slice(0, 80) });
          await loadFeed();
        } else if (polls >= MAX_POLLS) {
          // Timeout — just show the feed without AI reply
          clearInterval(pollInterval);
          pollInterval = null;
          pendingAiReplyId = null;
          emitDebug('ai-poll-timeout', { itemId, polls });
          await loadFeed();
        }
      } catch(e) {
        emitDebug('error', { context: 'ai-poll', message: e.message });
      }
    }, 2000);
  }

  // Render
  function render() {
    const container = document.getElementById(CONTAINER);
    if (!container) return;

    // Inject styles
    if (!document.getElementById('aafw-styles')) {
      const style = document.createElement('style');
      style.id = 'aafw-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }

    const tabEmojis = { comment: '💬', bug: '🐛', suggestion: '💡', rating: '⭐' };
    container.innerHTML = `
      <div class="aafw">
        <div class="aafw-tabs">
          <button class="aafw-tab ${currentType === 'comment' ? 'active' : ''}" data-type="comment">${tabEmojis.comment} Chat</button>
          <button class="aafw-tab ${currentType === 'bug' ? 'active' : ''}" data-type="bug">${tabEmojis.bug} Bug</button>
          <button class="aafw-tab ${currentType === 'suggestion' ? 'active' : ''}" data-type="suggestion">${tabEmojis.suggestion} Idea</button>
          <button class="aafw-tab ${currentType === 'rating' ? 'active' : ''}" data-type="rating">${tabEmojis.rating} Rate</button>
        </div>

        <div class="aafw-form">
          ${currentType === 'rating' ? `
            <div class="aafw-rating" id="aafw-rating">
              ${ratingEmojis.map((e, i) => `<button class="aafw-star ${currentRating === i+1 ? 'active' : ''}" data-r="${i+1}">${e}</button>`).join('')}
            </div>
          ` : ''}
          <textarea class="aafw-input" id="aafw-input" placeholder="${placeholders[currentType]}" maxlength="2000"></textarea>
          <button class="aafw-submit" id="aafw-submit">Send to Gemma</button>
          <div class="aafw-msg" id="aafw-msg"></div>
        </div>

        <div class="aafw-feed" id="aafw-feed"></div>
      </div>
    `;

    // Tab clicks
    container.querySelectorAll('.aafw-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentType = tab.dataset.type;
        currentRating = 0;
        render();
        loadFeed();
      });
    });

    // Rating clicks
    container.querySelectorAll('.aafw-star').forEach(star => {
      star.addEventListener('click', () => {
        currentRating = parseInt(star.dataset.r);
        container.querySelectorAll('.aafw-star').forEach(s => s.classList.remove('active'));
        star.classList.add('active');
      });
    });

    // Submit
    container.querySelector('#aafw-submit').addEventListener('click', async () => {
      const input = container.querySelector('#aafw-input');
      const msg = container.querySelector('#aafw-msg');
      const content = input.value.trim();

      if (!content && currentType !== 'rating') { msg.className = 'aafw-msg error'; msg.textContent = 'Write something first!'; return; }
      if (currentType === 'rating' && !currentRating) { msg.className = 'aafw-msg error'; msg.textContent = 'Pick a rating!'; return; }

      container.querySelector('#aafw-submit').disabled = true;
      try {
        const result = await submitFeedback(currentType, content || null, currentRating || null);
        msg.className = 'aafw-msg success';
        msg.textContent = '⚡ Received! Getting AI reply...';
        input.value = '';
        currentRating = 0;

        // Start polling for AI reply if we got an ID back
        const newItem = Array.isArray(result) ? result[0] : result;
        if (newItem?.id) {
          pendingAiReplyId = newItem.id;
          startAiReplyPoll(newItem.id);
        } else {
          setTimeout(() => loadFeed(), 500);
        }
      } catch(e) {
        msg.className = 'aafw-msg error';
        msg.textContent = 'Failed to send — try again.';
      }
      container.querySelector('#aafw-submit').disabled = false;
    });

    renderFeed();
    loadFeed();
  }

  function renderFeed() {
    const feed = document.getElementById('aafw-feed');
    if (!feed) return;

    if (!feedItems || feedItems.length === 0) {
      feed.innerHTML = '<div class="aafw-empty">Nothing here yet — start a conversation with Gemma below! 👇</div>';
      return;
    }

    feed.innerHTML = feedItems.map(item => `
      <div class="aafw-item">
        <div class="aafw-item-header">
          <span class="aafw-item-type-dot aafw-type-dot-${item.type}"></span>
          <span class="aafw-item-type-label">${typeLabels[item.type] || item.type}</span>
          <span class="aafw-item-sep">·</span>
          <span class="aafw-item-time">${timeAgo(item.created_at)}</span>
          ${item.rating ? `<span class="aafw-item-sep">·</span><span class="aafw-item-rating">${ratingStars(item.rating)}</span>` : ''}
        </div>
        ${item.content ? `<div class="aafw-item-content">${escapeHtml(item.content)}</div>` : ''}
        ${item.ai_reply ? `
          <div class="aafw-ai-reply">
            <div class="aafw-ai-avatar">🤖</div>
            <div class="aafw-ai-body">
              <div class="aafw-ai-name">Gemma — AI</div>
              <div class="aafw-ai-text">${escapeHtml(item.ai_reply)}</div>
            </div>
          </div>
        ` : item.id === pendingAiReplyId ? `
          <div class="aafw-ai-thinking">
            <div class="aafw-typing-dot"></div>
            <div class="aafw-typing-dot"></div>
            <div class="aafw-typing-dot"></div>
            <span>Gemma is thinking<span class="aafw-ai-thinking-dots"></span></span>
          </div>
        ` : ''}
        <div class="aafw-item-footer">
          <button class="aafw-heart ${hearted[item.id] ? 'hearted' : ''}" data-id="${item.id}">
            ${hearted[item.id] ? '❤️' : '🤍'} ${item.hearts || 0}
          </button>
        </div>
      </div>
    `).join('');

    // Heart clicks
    feed.querySelectorAll('.aafw-heart').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (hearted[id]) return;
        hearted[id] = true;
        localStorage.setItem('aa_hearted', JSON.stringify(hearted));
        await heartItem(id);
        loadFeed();
      });
    });
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
