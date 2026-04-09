/**
 * Autonomous Arcade — Intercom-style AI Chat Widget
 *
 * Drop anywhere:
 *   <div id="aa-chat"></div>
 *   <script src="/chat-widget.js" data-game-slug="pulse-run" data-api="/api/chat"></script>
 */
(function() {
  'use strict';

  const scriptTag  = document.currentScript;
  const API       = scriptTag?.getAttribute('data-api') || '/api/chat';
  const GAME_SLUG = scriptTag?.getAttribute('data-game-slug') || null;
  const CONTAINER = scriptTag?.getAttribute('data-container') || 'aa-chat';
  const CHAT_MODEL = 'gemma4:31b';

  // Persistent session per browser
  let sessionId = localStorage.getItem('aa_chat_sid');
  if (!sessionId) {
    sessionId = 'cs_' + Math.random().toString(36).substr(2, 12);
    localStorage.setItem('aa_chat_sid', sessionId);
  }

  // ─── Styles ───────────────────────────────────────────────────────────────────
  const css = `
    .aachat * { box-sizing: border-box; margin: 0; padding: 0; }
    .aachat { font-family: 'Segoe UI', system-ui, sans-serif; }

    /* ── Floating trigger button ─────────────────────────────────────────── */
    .aachat-trigger {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ff00aa, #cc0088);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(255,0,170,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      z-index: 99998;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .aachat-trigger:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(255,0,170,0.5); }
    .aachat-trigger.open { background: linear-gradient(135deg, #555, #333); }

    /* ── Chat panel ────────────────────────────────────────────────────────── */
    .aachat-panel {
      position: fixed;
      bottom: 88px;
      right: 20px;
      width: 380px;
      height: 560px;
      max-height: calc(100vh - 120px);
      background: #0a0a1f;
      border: 1px solid rgba(0,240,255,0.15);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      z-index: 99999;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
      transition: opacity 0.2s, transform 0.2s;
    }
    .aachat-panel.hidden { display: none; }

    /* ── Header ────────────────────────────────────────────────────────────── */
    .aachat-header {
      padding: 16px 18px;
      background: linear-gradient(135deg, rgba(0,240,255,0.08), rgba(255,0,170,0.05));
      border-bottom: 1px solid rgba(0,240,255,0.1);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .aachat-header-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00f0ff, #ff00aa);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .aachat-header-info { flex: 1; min-width: 0; }
    .aachat-header-name { font-size: 14px; font-weight: 700; color: #fff; }
    .aachat-header-sub { font-size: 11px; color: #00f0ff; }
    .aachat-header-close {
      background: none;
      border: none;
      color: #556;
      font-size: 18px;
      cursor: pointer;
      padding: 4px;
    }
    .aachat-header-close:hover { color: #fff; }

    /* ── Messages ──────────────────────────────────────────────────────────── */
    .aachat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .aachat-messages::-webkit-scrollbar { width: 3px; }
    .aachat-messages::-webkit-scrollbar-thumb { background: rgba(0,240,255,0.2); }

    .aachat-msg { display: flex; gap: 8px; align-items: flex-end; max-width: 90%; }
    .aachat-msg.player { align-self: flex-end; flex-direction: row-reverse; }
    .aachat-msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }
    .aachat-msg.player .aachat-msg-avatar { background: rgba(255,0,170,0.3); }
    .aachat-msg.ai .aachat-msg-avatar { background: linear-gradient(135deg, #00f0ff, #ff00aa); }
    .aachat-msg-bubble {
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.5;
      color: #ccd;
      max-width: 260px;
      word-break: break-word;
    }
    .aachat-msg.ai .aachat-msg-bubble {
      background: rgba(0,240,255,0.06);
      border: 1px solid rgba(0,240,255,0.1);
      border-bottom-left-radius: 4px;
    }
    .aachat-msg.player .aachat-msg-bubble {
      background: rgba(255,0,170,0.15);
      border: 1px solid rgba(255,0,170,0.2);
      border-bottom-right-radius: 4px;
      color: #fff;
    }
    .aachat-msg.ai .aachat-msg-bubble { color: #dde; }
    .aachat-msg.ai .aachat-msg-bubble strong { color: #00f0ff; }

    /* ── Typing indicator ─────────────────────────────────────────────────── */
    .aachat-typing {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 10px 14px;
      background: rgba(0,240,255,0.04);
      border: 1px solid rgba(0,240,255,0.08);
      border-radius: 14px;
      border-bottom-left-radius: 4px;
      max-width: 80px;
    }
    .aachat-typing-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #00f0ff;
      animation: aachat-bounce 1.2s infinite;
    }
    .aachat-typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .aachat-typing-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes aachat-bounce {
      0%,60%,100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }

    /* ── Input bar ─────────────────────────────────────────────────────────── */
    .aachat-input-bar {
      padding: 12px 14px;
      border-top: 1px solid rgba(0,240,255,0.08);
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .aachat-input {
      flex: 1;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(0,240,255,0.12);
      border-radius: 10px;
      padding: 10px 12px;
      color: #fff;
      font-size: 13px;
      font-family: inherit;
      resize: none;
      min-height: 42px;
      max-height: 100px;
      outline: none;
      line-height: 1.4;
      transition: border-color 0.2s;
    }
    .aachat-input::placeholder { color: #556; }
    .aachat-input:focus { border-color: rgba(0,240,255,0.4); }
    .aachat-send {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: linear-gradient(135deg, #ff00aa, #cc0088);
      border: none;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .aachat-send:hover { transform: scale(1.05); }
    .aachat-send:disabled { opacity: 0.4; cursor: default; transform: none; }

    /* ── Welcome message ──────────────────────────────────────────────────── */
    .aachat-welcome {
      text-align: center;
      padding: 24px 16px;
      color: #556;
      font-size: 13px;
    }
    .aachat-welcome-title { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 8px; }
    .aachat-welcome-sub { line-height: 1.6; }

    /* ── Generation notice ────────────────────────────────────────────────── */
    .aachat-gen-notice {
      text-align: center;
      font-size: 10px;
      color: #445;
      padding: 6px 0;
      letter-spacing: 0.5px;
    }
  `;

  // ─── State ─────────────────────────────────────────────────────────────────
  let messages = [];         // { role: 'player'|'ai', content: string }
  let isOpen = false;
  let isLoading = false;

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function emitDebug(type, data) {
    try {
      window.dispatchEvent(new CustomEvent('aa-debug', { detail: { type, data, ts: Date.now() } }));
    } catch(e) {}
  }

  function scrollToBottom() {
    const el = document.querySelector('.aachat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function typeIcon(role) {
    return role === 'ai' ? '🤖' : '🙋';
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  function render() {
    let container = document.getElementById(CONTAINER);
    if (!container) return;

    if (!document.getElementById('aachat-styles')) {
      const style = document.createElement('style');
      style.id = 'aachat-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }

    // Build messages HTML
    let messagesHtml = '';
    if (messages.length === 0) {
      messagesHtml = `
        <div class="aachat-welcome">
          <div class="aachat-welcome-title">Ask me anything 🎮</div>
          <div class="aachat-welcome-sub">
            ${GAME_SLUG
              ? 'I have full context on this game. Ask how to play, tips, strategies, or anything about it.'
              : 'Ask about any game on Autonomous Arcade, how the site works, or anything else!'}
          </div>
        </div>
      `;
    } else {
      messagesHtml = messages.map(m => `
        <div class="aachat-msg ${m.role}">
          <div class="aachat-msg-avatar">${typeIcon(m.role)}</div>
          <div class="aachat-msg-bubble">${escapeHtml(m.content)}</div>
        </div>
      `).join('');
    }

    // Typing indicator
    let typingHtml = '';
    if (isLoading) {
      typingHtml = `
        <div class="aachat-msg ai">
          <div class="aachat-msg-avatar">🤖</div>
          <div class="aachat-typing">
            <div class="aachat-typing-dot"></div>
            <div class="aachat-typing-dot"></div>
            <div class="aachat-typing-dot"></div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <button class="aachat-trigger ${isOpen ? 'open' : ''}" id="aachat-trigger">
        💬
      </button>
      <div class="aachat-panel ${isOpen ? '' : 'hidden'}" id="aachat-panel">
        <div class="aachat-header">
          <div class="aachat-header-avatar">🤖</div>
          <div class="aachat-header-info">
            <div class="aachat-header-name">Gemma AI</div>
            <div class="aachat-header-sub">Powered by Gemma 4 · Free</div>
          </div>
          <button class="aachat-header-close" id="aachat-close">✕</button>
        </div>

        <div class="aachat-messages" id="aachat-messages">
          ${messagesHtml}
          ${typingHtml}
        </div>

        <div class="aachat-gen-notice">🤖 Gemma 4 — 100% free, runs locally on Ryan's Mac</div>

        <div class="aachat-input-bar">
          <textarea
            class="aachat-input"
            id="aachat-input"
            placeholder="${GAME_SLUG ? 'Ask about this game...' : 'Ask about any game...'}"
            rows="1"
            maxlength="1000"
          ></textarea>
          <button class="aachat-send" id="aachat-send" ${isLoading ? 'disabled' : ''}>➤</button>
        </div>
      </div>
    `;

    // Attach events
    document.getElementById('aachat-trigger').addEventListener('click', () => {
      isOpen = !isOpen;
      render();
      if (isOpen) {
        setTimeout(() => document.getElementById('aachat-input')?.focus(), 100);
      }
    });

    document.getElementById('aachat-close').addEventListener('click', () => {
      isOpen = false;
      render();
    });

    const input = document.getElementById('aachat-input');
    const sendBtn = document.getElementById('aachat-send');

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    // Send on Enter (Shift+Enter for newline)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    sendBtn.addEventListener('click', () => sendMessage());

    if (isOpen) scrollToBottom();
  }

  // ─── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    const input = document.getElementById('aachat-input');
    const content = input?.value.trim();
    if (!content || isLoading) return;

    input.value = '';
    input.style.height = 'auto';

    messages.push({ role: 'player', content });
    isLoading = true;
    render();
    scrollToBottom();

    try {
      const url = new URL(API, window.location.origin);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_slug: GAME_SLUG,
          session_id: sessionId,
          message: content,
          history: messages.slice(0, -1), // exclude the one we just added
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      messages.push({ role: 'ai', content: data.reply });
      emitDebug('chat-msg', { role: 'ai', content: data.reply.slice(0, 80), generated: data.instructionsGenerated });
    } catch(e) {
      messages.push({ role: 'ai', content: "Sorry, I'm having trouble responding right now. Try again in a moment." });
      emitDebug('chat-error', { message: e.message });
    }

    isLoading = false;
    render();
    scrollToBottom();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
