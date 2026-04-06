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
    .aafw-item {
      background: ${colors.cardBg}; border: 1px solid ${colors.border}; border-radius: 12px;
      padding: 14px 16px; transition: border-color 0.2s;
    }
    .aafw-item:hover { border-color: rgba(0,240,255,0.2); }
    .aafw-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .aafw-item-type {
      font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      padding: 2px 8px; border-radius: 6px;
    }
    .aafw-type-comment { background: rgba(0,240,255,0.1); color: ${colors.cyan}; }
    .aafw-type-bug { background: rgba(255,60,60,0.1); color: #ff4444; }
    .aafw-type-suggestion { background: rgba(100,255,100,0.1); color: #44cc44; }
    .aafw-type-rating { background: rgba(255,200,0,0.1); color: #ffcc00; }

    .aafw-item-time { font-size: 11px; color: ${colors.muted}; }
    .aafw-item-content { color: ${colors.text}; font-size: 14px; line-height: 1.6; margin-bottom: 8px; }
    .aafw-item-rating { font-size: 16px; margin-bottom: 4px; }
    .aafw-item-footer { display: flex; align-items: center; gap: 12px; }
    .aafw-heart {
      background: none; border: none; color: ${colors.muted}; cursor: pointer;
      font-size: 13px; display: flex; align-items: center; gap: 4px; transition: color 0.2s;
    }
    .aafw-heart:hover { color: ${colors.accent}; }
    .aafw-heart.hearted { color: ${colors.accent}; }

    .aafw-empty { text-align: center; color: ${colors.muted}; padding: 32px 0; font-size: 14px; }
    .aafw-msg { padding: 12px 0; font-size: 14px; font-weight: 600; }
    .aafw-msg.success { color: ${colors.cyan}; }
    .aafw-msg.error { color: #ff4444; }
    .aafw-page-url { font-size: 11px; color: ${colors.muted}; word-break: break-all; }

    /* AI Reply */
    .aafw-ai-reply {
      margin-top: 10px; padding: 10px 12px; border-radius: 8px;
      background: rgba(0,240,255,0.05); border: 1px solid rgba(0,240,255,0.15);
      font-size: 13px; line-height: 1.5; color: ${colors.text};
    }
    .aafw-ai-badge {
      display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: 1px;
      text-transform: uppercase; padding: 2px 6px; border-radius: 4px; margin-bottom: 6px;
      background: rgba(0,240,255,0.15); color: ${colors.cyan};
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

  const typeLabels = { comment: '💬 Comment', bug: '🐛 Bug', suggestion: '💡 Idea', rating: '⭐ Rating' };
  const placeholders = {
    comment: 'Share your thoughts...',
    bug: 'What went wrong? Steps to reproduce...',
    suggestion: 'What would make this better?',
    rating: 'Optional: tell us more about your rating...',
  };

  // State
  let currentType = 'comment';
  let currentRating = 0;
  let feedItems = [];
  let hearted = JSON.parse(localStorage.getItem('aa_hearted') || '{}');

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
    feedItems = await apiFetch('GET', { query });
    renderFeed();
  }

  async function submitFeedback(type, content, rating) {
    return apiFetch('POST', {
      body: {
        type,
        content: content || null,
        rating: rating || null,
        game_id: GAME_ID || null,
        page_url: location.href,
        session_id: sessionId,
      }
    });
  }

  async function heartItem(id) {
    return apiFetch('PATCH', { query: { id } });
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

    container.innerHTML = `
      <div class="aafw">
        <div class="aafw-tabs">
          <button class="aafw-tab ${currentType === 'comment' ? 'active' : ''}" data-type="comment">💬 Comment</button>
          <button class="aafw-tab ${currentType === 'bug' ? 'active' : ''}" data-type="bug">🐛 Bug</button>
          <button class="aafw-tab ${currentType === 'suggestion' ? 'active' : ''}" data-type="suggestion">💡 Idea</button>
          <button class="aafw-tab ${currentType === 'rating' ? 'active' : ''}" data-type="rating">⭐ Rate</button>
        </div>

        <div class="aafw-form">
          ${currentType === 'rating' ? `
            <div class="aafw-rating" id="aafw-rating">
              ${ratingEmojis.map((e, i) => `<button class="aafw-star ${currentRating === i+1 ? 'active' : ''}" data-r="${i+1}">${e}</button>`).join('')}
            </div>
          ` : ''}
          <textarea class="aafw-input" id="aafw-input" placeholder="${placeholders[currentType]}" maxlength="2000"></textarea>
          <button class="aafw-submit" id="aafw-submit">Send ${typeLabels[currentType].split(' ')[1]}</button>
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
        await submitFeedback(currentType, content || null, currentRating || null);
        msg.className = 'aafw-msg success';
        msg.textContent = '⚡ Received! This feeds into the next AI build cycle.';
        input.value = '';
        currentRating = 0;
        setTimeout(() => loadFeed(), 500);
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
      feed.innerHTML = '<div class="aafw-empty">No feedback yet. Be the first!</div>';
      return;
    }

    feed.innerHTML = feedItems.map(item => `
      <div class="aafw-item">
        <div class="aafw-item-header">
          <span class="aafw-item-type aafw-type-${item.type}">${typeLabels[item.type] || item.type}</span>
          <span class="aafw-item-time">${timeAgo(item.created_at)}</span>
        </div>
        ${item.rating ? `<div class="aafw-item-rating">${ratingStars(item.rating)}</div>` : ''}
        ${item.content ? `<div class="aafw-item-content">${escapeHtml(item.content)}</div>` : ''}
        ${item.ai_reply ? `
          <div class="aafw-ai-reply">
            <div class="aafw-ai-badge">AI Reply</div>
            ${escapeHtml(item.ai_reply)}
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
