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
    feedBg: isDark ? 'transparent' : '#f0f0f0',
  };

  const css = `
    .aafw { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 100%; }
    .aafw * { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── YouTube-style input bar ───────────────────────────────── */
    .aafw-input-bar {
      display: flex;
      gap: 10px;
      align-items: flex-end;
      padding: 14px;
      background: ${colors.cardBg};
      border: 1px solid ${colors.border};
      border-radius: 12px;
      margin-bottom: 16px;
    }
    .aafw-input-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${colors.accent}, ${colors.accentHover});
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
      margin-bottom: 2px;
    }
    .aafw-input-col { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .aafw-input-tabs {
      display: flex;
      gap: 4px;
    }
    .aafw-input-tab {
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid ${colors.border};
      background: transparent;
      color: ${colors.muted};
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      transition: all 0.2s;
    }
    .aafw-input-tab:hover { border-color: ${colors.accent}; color: ${colors.text}; }
    .aafw-input-tab.active { background: ${colors.accent}; border-color: ${colors.accent}; color: #fff; }

    .aafw-rating {
      display: flex;
      gap: 6px;
    }
    .aafw-star {
      background: none;
      border: 2px solid ${colors.inputBorder};
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 18px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .aafw-star:hover, .aafw-star.active {
      border-color: ${colors.accent};
      background: rgba(255,0,170,0.1);
      transform: scale(1.1);
    }

    .aafw-input {
      width: 100%;
      background: ${colors.inputBg};
      border: 1px solid ${colors.inputBorder};
      border-radius: 8px;
      padding: 10px 12px;
      color: ${colors.text};
      font-size: 14px;
      font-family: inherit;
      resize: none;
      min-height: 44px;
      max-height: 120px;
      outline: none;
      transition: border-color 0.2s;
      line-height: 1.4;
    }
    .aafw-input::placeholder { color: ${colors.muted}; }
    .aafw-input:focus { border-color: ${colors.cyan}; }

    .aafw-send {
      background: linear-gradient(135deg, ${colors.accent}, ${colors.accentHover});
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .aafw-send:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(255,0,170,0.3); }
    .aafw-send:disabled { opacity: 0.3; cursor: default; transform: none; }

    /* ── Feed ───────────────────────────────────────────────────── */
    .aafw-feed {
      display: flex;
      flex-direction: column;
      gap: 0;
      background: ${colors.feedBg};
      border-radius: 12px;
      overflow: hidden;
    }
    .aafw-item {
      display: flex;
      gap: 12px;
      padding: 14px 14px;
      border-bottom: 1px solid ${colors.border};
      transition: background 0.15s;
    }
    .aafw-item:last-child { border-bottom: none; }
    .aafw-item:hover { background: rgba(255,255,255,0.02); }

    .aafw-item-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    .aafw-item-avatar.ai { background: linear-gradient(135deg, ${colors.cyan}, ${colors.accent}); }

    .aafw-item-col { flex: 1; min-width: 0; }
    .aafw-item-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
      flex-wrap: wrap;
    }
    .aafw-item-name {
      font-size: 12px;
      font-weight: 700;
      color: ${colors.text};
    }
    .aafw-item-badge {
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .aafw-badge-comment { background: rgba(0,240,255,0.1); color: ${colors.cyan}; }
    .aafw-badge-bug { background: rgba(255,68,68,0.1); color: #ff4444; }
    .aafw-badge-suggestion { background: rgba(68,204,68,0.1); color: #44cc44; }
    .aafw-badge-rating { background: rgba(255,204,0,0.1); color: #ffcc00; }
    .aafw-item-time { font-size: 11px; color: ${colors.muted}; }
    .aafw-item-sep { color: ${colors.border}; font-size: 11px; }

    .aafw-item-body {
      font-size: 13px;
      line-height: 1.5;
      color: ${colors.text};
      margin-bottom: 6px;
    }
    .aafw-item-rating-row { font-size: 18px; margin-bottom: 4px; }

    .aafw-item-footer {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .aafw-action {
      background: none;
      border: none;
      color: ${colors.muted};
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 0;
      transition: color 0.2s;
    }
    .aafw-action:hover { color: ${colors.text}; }
    .aafw-action.hearted { color: ${colors.accent}; }

    /* ── AI reply — YouTube comment style ────────────────────────── */
    .aafw-ai-reply {
      margin-top: 8px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(0,240,255,0.04);
      border-left: 2px solid ${colors.cyan};
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .aafw-ai-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${colors.cyan}, ${colors.accent});
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      flex-shrink: 0;
    }
    .aafw-ai-body { flex: 1; min-width: 0; }
    .aafw-ai-name {
      font-size: 11px;
      font-weight: 700;
      color: ${colors.cyan};
      margin-bottom: 3px;
      letter-spacing: 0.5px;
    }
    .aafw-ai-text { font-size: 13px; line-height: 1.5; color: ${colors.text}; }

    .aafw-ai-thinking {
      margin-top: 8px;
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(0,240,255,0.04);
      border-left: 2px solid rgba(0,240,255,0.2);
      font-size: 12px;
      color: ${colors.muted};
    }
    .aafw-ai-thinking-dots::after { content: ''; animation: aafw-dots 1.5s infinite; }
    @keyframes aafw-dots { 0%,20%{content:'.'} 40%{content:'..'} 60%,100%{content:'...'} }
    .aafw-typing-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${colors.cyan};
      flex-shrink: 0;
      animation: aafw-typing-bounce 1.2s infinite;
    }
    .aafw-typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .aafw-typing-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes aafw-typing-bounce {
      0%,60%,100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    .aafw-empty {
      text-align: center;
      color: ${colors.muted};
      padding: 40px 20px;
      font-size: 13px;
    }
    .aafw-msg { padding: 8px 0; font-size: 13px; font-weight: 600; text-align: center; }
    .aafw-msg.success { color: ${colors.cyan}; }
    .aafw-msg.error { color: #ff4444; }

    .aafw-loading {
      display: flex;
      gap: 6px;
      align-items: center;
      justify-content: center;
      padding: 16px;
      color: ${colors.muted};
      font-size: 12px;
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
    rating: 'Tell us more about your rating (optional)...',
  };
  const tabIcons = { comment: '💬', bug: '🐛', suggestion: '💡', rating: '⭐' };

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
  let pendingAiReplyId = null;
  let pollInterval = null;
  let isLoading = false;

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

    const MAX_POLLS = 30;
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

    const emoji = { comment: '🙋', bug: '🐛', suggestion: '💡', rating: '⭐' };
    container.innerHTML = `
      <div class="aafw">
        <!-- Always-visible YouTube-style input bar -->
        <div class="aafw-input-bar">
          <div class="aafw-input-avatar">🙋</div>
          <div class="aafw-input-col">
            <div class="aafw-input-tabs">
              <button class="aafw-input-tab ${currentType === 'comment' ? 'active' : ''}" data-type="comment">${tabIcons.comment} Chat</button>
              <button class="aafw-input-tab ${currentType === 'bug' ? 'active' : ''}" data-type="bug">${tabIcons.bug} Bug</button>
              <button class="aafw-input-tab ${currentType === 'suggestion' ? 'active' : ''}" data-type="suggestion">${tabIcons.suggestion} Idea</button>
              <button class="aafw-input-tab ${currentType === 'rating' ? 'active' : ''}" data-type="rating">${tabIcons.rating} Rate</button>
            </div>

            ${currentType === 'rating' ? `
              <div class="aafw-rating">
                ${ratingEmojis.map((e, i) => `<button class="aafw-star ${currentRating === i+1 ? 'active' : ''}" data-r="${i+1}">${e}</button>`).join('')}
              </div>
            ` : ''}

            <textarea
              class="aafw-input"
              id="aafw-input"
              placeholder="${placeholders[currentType]}"
              maxlength="2000"
              rows="1"
            ></textarea>

            <button class="aafw-send" id="aafw-send">Send to Gemma</button>
          </div>
        </div>

        <div class="aafw-msg" id="aafw-msg"></div>
        <div class="aafw-feed" id="aafw-feed"></div>
      </div>
    `;

    // Auto-resize textarea
    const textarea = container.querySelector('#aafw-input');
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });

    // Tab clicks
    container.querySelectorAll('.aafw-input-tab').forEach(tab => {
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
    container.querySelector('#aafw-send').addEventListener('click', async () => {
      const input = container.querySelector('#aafw-input');
      const msg = container.querySelector('#aafw-msg');
      const content = input.value.trim();

      if (!content && currentType !== 'rating') {
        msg.className = 'aafw-msg error';
        msg.textContent = 'Write something first!';
        return;
      }
      if (currentType === 'rating' && !currentRating) {
        msg.className = 'aafw-msg error';
        msg.textContent = 'Pick a rating!';
        return;
      }

      container.querySelector('#aafw-send').disabled = true;
      try {
        const result = await submitFeedback(currentType, content || null, currentRating || null);
        msg.className = 'aafw-msg success';
        msg.textContent = '⚡ Received! Gemma is thinking...';
        input.value = '';
        textarea.style.height = 'auto';
        currentRating = 0;

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
      container.querySelector('#aafw-send').disabled = false;
    });

    renderFeed();
    loadFeed();
  }

  function renderFeed() {
    const feed = document.getElementById('aafw-feed');
    if (!feed) return;

    if (!feedItems || feedItems.length === 0) {
      feed.innerHTML = '<div class="aafw-empty">Be the first to leave feedback 👇</div>';
      return;
    }

    feed.innerHTML = feedItems.map(item => {
      const isAi = !!item.ai_reply;
      const isPending = item.id === pendingAiReplyId;
      const badges = {
        comment: '<span class="aafw-item-badge aafw-badge-comment">💬 Chat</span>',
        bug: '<span class="aafw-item-badge aafw-badge-bug">🐛 Bug</span>',
        suggestion: '<span class="aafw-item-badge aafw-badge-suggestion">💡 Idea</span>',
        rating: '<span class="aafw-item-badge aafw-badge-rating">⭐ Rating</span>',
      };

      return `
        <div class="aafw-item">
          <div class="aafw-item-avatar ${isAi ? 'ai' : ''}">${isAi ? '🤖' : '🙋'}</div>
          <div class="aafw-item-col">
            <div class="aafw-item-meta">
              <span class="aafw-item-name">${isAi ? 'Gemma — AI' : 'Player'}</span>
              ${badges[item.type] || ''}
              <span class="aafw-item-sep">·</span>
              <span class="aafw-item-time">${timeAgo(item.created_at)}</span>
            </div>

            ${item.rating ? `<div class="aafw-item-rating-row">${ratingStars(item.rating)}</div>` : ''}
            ${item.content ? `<div class="aafw-item-body">${escapeHtml(item.content)}</div>` : ''}

            ${item.ai_reply ? `
              <div class="aafw-ai-reply">
                <div class="aafw-ai-avatar">🤖</div>
                <div class="aafw-ai-body">
                  <div class="aafw-ai-name">Gemma — AI</div>
                  <div class="aafw-ai-text">${escapeHtml(item.ai_reply)}</div>
                </div>
              </div>
            ` : isPending ? `
              <div class="aafw-ai-thinking">
                <div class="aafw-typing-dot"></div>
                <div class="aafw-typing-dot"></div>
                <div class="aafw-typing-dot"></div>
                <span>Gemma is thinking<span class="aafw-ai-thinking-dots"></span></span>
              </div>
            ` : ''}

            <div class="aafw-item-footer">
              <button class="aafw-action ${hearted[item.id] ? 'hearted' : ''}" data-id="${item.id}">
                ${hearted[item.id] ? '❤️' : '👍'} ${item.hearts || 0}
              </button>
              <button class="aafw-action" onclick="window.aaShareFeedback?.('${item.id}')">
                🔗 Share
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Heart clicks
    feed.querySelectorAll('.aafw-action[data-id]').forEach(btn => {
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
