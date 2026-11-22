/**
 * ChatGPT Bulk Delete - Conversation Preview
 *
 * Adds a "Preview conversation" icon to each selectable row and shows the
 * conversation in a read-only floating panel on the right, so users can check
 * the content before selecting it.
 *
 * Rendering: a same-origin iframe loads ChatGPT's own page for the
 * conversation (chatgpt.com allows `frame-ancestors 'self'`). We hide the
 * sidebar, header and composer inside the frame so it stays read-only.
 * Conversation text never leaves the page: nothing is logged or reported.
 *
 * The panel deliberately avoids role="dialog" so the delete flow's
 * confirm-dialog selectors and failure diagnostics never match it.
 */

(function() {
  'use strict';

  if (window.conversationPreviewLoaded) {
    return;
  }
  window.conversationPreviewLoaded = true;

  const t = (key, params) => window.BDI18n.t(key, params);

  const BUTTON_CLASS = 'bulk-delete-preview-button';
  const PANEL_ID = 'bulk-delete-preview-panel';
  const STYLE_ID = 'bulk-delete-preview-style';
  const FRAME_STYLE_ID = 'bulk-delete-preview-frame-style';
  // ChatGPT has used each of these for rendered turns (checked 2026-11-21:
  // user bubbles + assistant response bodies; older builds: author role).
  const MESSAGE_SELECTOR = [
    '[data-message-author-role]',
    '[data-user-message-bubble]',
    '[data-response-body]',
    '[data-conversation-role]'
  ].join(', ');
  const LOAD_TIMEOUT_MS = 20000;
  const POLL_INTERVAL_MS = 250;

  // Hides everything that could start an action inside the framed page.
  // Buttons are hidden wholesale: per-turn actions (edit, share, feedback,
  // "More actions") are only identifiable by localized aria-labels.
  const FRAME_READONLY_CSS = `
    nav, aside, header, #page-header,
    [data-testid="left-sidebar"], [id^="stage-slideover-sidebar"],
    form, #thread-bottom-container, #thread-bottom,
    [data-thread-composer-backdrop], [data-chatgpt-composer],
    .turn-action-controls,
    button, [role="button"], [role="menuitem"], [aria-haspopup] {
      display: none !important;
    }
    html, body { overflow-x: hidden !important; }
  `;

  const EYE_ICON = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`;

  const state = {
    panel: null,
    requestId: 0,
    activeRoute: null,
    pollTimer: null,
    frameKeyTarget: null,
    // 'peek': opened by hovering the icon, closes when the pointer leaves.
    // 'pinned': opened by clicking, stays until closed manually.
    mode: null,
    hoverOpenTimer: null,
    hoverCloseTimer: null,
    syncTimer: null
  };
  const HOVER_OPEN_DELAY_MS = 350;
  // The panel is on the far side of the page from the sidebar icon; leave
  // time to move the pointer across without the peek closing.
  const HOVER_CLOSE_DELAY_MS = 600;
  const SYNC_INTERVAL_MS = 300;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BUTTON_CLASS} {
        position: absolute !important;
        inset-inline-start: 26px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        z-index: 11 !important;
        width: 22px !important;
        height: 22px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        margin: 0 !important;
        border: 0 !important;
        border-radius: 6px !important;
        background: var(--sidebar-surface-primary, rgba(127,127,127,0.15)) !important;
        color: inherit !important;
        opacity: 0.55;
        cursor: pointer !important;
        pointer-events: auto !important;
      }
      .${BUTTON_CLASS}:hover, .${BUTTON_CLASS}:focus-visible,
      .${BUTTON_CLASS}[aria-pressed="true"] { opacity: 1; }
      #${PANEL_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        bottom: 16px;
        left: auto;
        width: min(460px, calc(100vw - 32px));
        z-index: 2147483000;
        display: flex;
        flex-direction: column;
        background: var(--main-surface-primary, #fff);
        color: var(--text-primary, #0d0d0d);
        border: 1px solid rgba(127,127,127,0.3);
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        overflow: hidden;
        font-size: 14px;
      }
      #${PANEL_ID} .bdp-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(127,127,127,0.25);
        flex: none;
      }
      #${PANEL_ID} .bdp-select {
        flex: none;
        width: 16px !important;
        height: 16px !important;
        margin: 0 !important;
        appearance: auto !important;
        cursor: pointer;
      }
      #${PANEL_ID} .bdp-select:disabled { cursor: default; opacity: 0.4; }
      #${PANEL_ID} .bdp-title {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .bdp-open {
        flex: none;
        font-size: 12px;
        text-decoration: underline;
        color: inherit;
        opacity: 0.8;
      }
      #${PANEL_ID} .bdp-close {
        flex: none;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
      }
      #${PANEL_ID} .bdp-close:hover { background: rgba(127,127,127,0.15); }
      #${PANEL_ID} .bdp-body {
        position: relative;
        flex: 1;
        min-height: 0;
      }
      #${PANEL_ID} iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        background: transparent;
      }
      #${PANEL_ID} .bdp-status {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 24px;
        text-align: center;
        background: var(--main-surface-primary, #fff);
        opacity: 0.85;
      }
      #${PANEL_ID} .bdp-status[hidden] { display: none; }
      /* ChatGPT in a right-to-left language has its sidebar on the right. */
      #${PANEL_ID}.bdp-page-rtl { right: auto; left: 16px; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function conversationId(path) {
    const match = /\/c\/([^/?#]+)/.exec(path || '');
    return match ? match[1] : null;
  }

  // Project rows put the title and a message snippet in the same link, so the
  // link's full text isn't a usable title. Use its first text-bearing leaf.
  function rowTitle(conversation, fallback) {
    const link = conversation.matches('a[href*="/c/"]')
      ? conversation
      : conversation.querySelector('a[href*="/c/"]');
    if (link) {
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (text) {
          return text;
        }
      }
    }
    return fallback || '';
  }

  function routeToUrl(route) {
    return new URL(route, window.location.origin).href;
  }

  function createPanel() {
    injectStyles();
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', t('preview.panel'));
    window.BDI18n.markElement(panel);
    panel.classList.toggle('bdp-page-rtl', getComputedStyle(document.body || document.documentElement).direction === 'rtl');
    // Keeps the panel's own /c/ link out of conversation detection.
    panel.dataset.bulkDeleteIgnore = 'true';

    const header = document.createElement('div');
    header.className = 'bdp-header';

    // Mirrors the row checkbox(es) of the previewed conversation. Not a
    // .conversation-checkbox, so bulk runs never pick it up directly.
    const select = document.createElement('input');
    select.type = 'checkbox';
    select.className = 'bdp-select';
    select.title = t('preview.select');
    select.setAttribute('aria-label', t('preview.select'));
    select.addEventListener('change', () => {
      const rows = rowCheckboxes(state.activeRoute);
      rows.forEach((checkbox) => {
        checkbox.checked = select.checked;
      });
      // Same as ticking the row itself: it becomes the Shift-range anchor.
      if (select.checked && rows[0] && window.GlobalState) {
        window.GlobalState.setLastCheckedCheckbox(rows[0]);
      }
    });

    const title = document.createElement('div');
    title.className = 'bdp-title';

    const open = document.createElement('a');
    open.className = 'bdp-open';
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = t('preview.open');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bdp-close';
    close.setAttribute('aria-label', t('preview.close'));
    close.textContent = '×';
    close.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closePreview();
    });

    header.append(select, title, open, close);

    const body = document.createElement('div');
    body.className = 'bdp-body';

    const status = document.createElement('div');
    status.className = 'bdp-status';
    body.appendChild(status);

    panel.append(header, body);
    // Keep panel interactions from reaching ChatGPT's global handlers.
    panel.addEventListener('click', (event) => event.stopPropagation());
    // Hover-opened preview: stays while the pointer is over it, and any
    // interaction with it turns it into a pinned preview.
    panel.addEventListener('mouseenter', cancelHoverClose);
    panel.addEventListener('mouseleave', scheduleHoverClose);
    panel.addEventListener('pointerdown', () => { state.mode = 'pinned'; });

    document.body.appendChild(panel);
    return { panel, select, title, open, body, status };
  }

  function setStatus(text, isError = false) {
    if (!state.panel) {
      return;
    }
    const { status } = state.panel;
    status.hidden = !text;
    status.textContent = '';
    if (!text) {
      return;
    }
    const line = document.createElement('div');
    line.textContent = text;
    status.appendChild(line);
    if (isError) {
      const hint = document.createElement('div');
      hint.style.fontSize = '12px';
      hint.style.opacity = '0.75';
      hint.textContent = t('preview.errorHint');
      status.appendChild(hint);
    }
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function detachFrameKeyListener() {
    if (state.frameKeyTarget) {
      try {
        state.frameKeyTarget.removeEventListener('keydown', onKeydown, true);
      } catch (error) {
        // Frame document already gone.
      }
      state.frameKeyTarget = null;
    }
  }

  function updatePressedButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(Boolean(state.activeRoute) && button.dataset.route === state.activeRoute)
      );
    });
  }

  function framedMessagesReady(frame, route) {
    let doc;
    try {
      doc = frame.contentDocument;
    } catch (error) {
      return { error: 'blocked' };
    }
    if (!doc || !doc.body) {
      return null;
    }
    // ChatGPT may redirect (deleted chat, logged out) — don't show a different
    // page. Compare conversation ids only: project chats get redirected from
    // /g/<id>/c/<cid> to /g/<id>-<project-slug>/c/<cid>.
    try {
      const framePath = frame.contentWindow.location.pathname;
      if (framePath !== 'blank' && conversationId(framePath) !== conversationId(route)) {
        return { error: 'redirected' };
      }
    } catch (error) {
      return { error: 'blocked' };
    }
    if (!doc.getElementById(FRAME_STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = FRAME_STYLE_ID;
      style.textContent = FRAME_READONLY_CSS;
      (doc.head || doc.documentElement).appendChild(style);
    }
    if (state.frameKeyTarget !== doc) {
      detachFrameKeyListener();
      doc.addEventListener('keydown', onKeydown, true);
      state.frameKeyTarget = doc;
      // Hidden controls aside, ChatGPT's keyboard shortcuts (e.g. delete
      // chat) would still act on the framed conversation. Keep key events
      // from its handlers; default actions (scroll, copy, find) still work.
      const frameWindow = doc.defaultView;
      // Flag on the document: the initial about:blank Window can be reused.
      if (frameWindow && !doc.__bulkDeleteKeyGuard) {
        doc.__bulkDeleteKeyGuard = true;
        ['keydown', 'keyup', 'keypress'].forEach((type) => {
          frameWindow.addEventListener(type, (event) => {
            if (event.key === 'Escape' && type === 'keydown') {
              return; // closes the preview (onKeydown)
            }
            event.stopImmediatePropagation();
          }, true);
        });
      }
    }
    return doc.querySelector(MESSAGE_SELECTOR) ? { ready: true } : null;
  }

  function loadIntoFrame(route, requestId) {
    const { body } = state.panel;
    body.querySelectorAll('iframe').forEach((frame) => frame.remove());
    detachFrameKeyListener();
    stopPolling();

    // A fresh iframe with src set before insertion doesn't add entries to
    // the tab's history, unlike re-pointing an existing frame.
    const frame = document.createElement('iframe');
    frame.title = t('preview.panel');
    frame.src = routeToUrl(route);
    frame.style.visibility = 'hidden';
    body.insertBefore(frame, body.firstChild);

    const startedAt = Date.now();
    setStatus(t('preview.loading'));

    state.pollTimer = setInterval(() => {
      // A newer preview (or close) superseded this one.
      if (requestId !== state.requestId) {
        return;
      }
      const result = framedMessagesReady(frame, route);
      if (result && result.ready) {
        stopPolling();
        frame.style.visibility = 'visible';
        setStatus('');
        watchFrame(frame, route, requestId);
        return;
      }
      if ((result && result.error) || Date.now() - startedAt > LOAD_TIMEOUT_MS) {
        stopPolling();
        frame.remove();
        detachFrameKeyListener();
        setStatus(t('preview.error'), true);
      }
    }, POLL_INTERVAL_MS);
  }

  // After the first render: a full reload inside the frame gets a fresh
  // document without our read-only CSS, and an in-app link could switch the
  // frame to another conversation. Re-check on load and periodically.
  function watchFrame(frame, route, requestId) {
    const check = () => {
      if (requestId !== state.requestId || !frame.isConnected) {
        return false;
      }
      const result = framedMessagesReady(frame, route);
      if (result && result.error) {
        stopPolling();
        frame.remove();
        detachFrameKeyListener();
        setStatus(t('preview.error'), true);
        return false;
      }
      return true;
    };
    frame.addEventListener('load', check);
    state.pollTimer = setInterval(() => {
      if (!check()) {
        stopPolling();
      }
    }, 1000);
  }

  function rowCheckboxes(route) {
    if (!route) {
      return [];
    }
    return Array.from(document.querySelectorAll('.conversation-checkbox'))
      .filter((checkbox) => checkbox.isConnected && checkbox.dataset.bulkDeleteRoute === route);
  }

  // Row checkboxes change through clicks, Shift ranges, "toggle all" and
  // re-renders, most without events, so poll while the panel is open.
  function syncSelect() {
    if (!state.panel) {
      return;
    }
    const rows = rowCheckboxes(state.activeRoute);
    const { select } = state.panel;
    select.disabled = rows.length === 0;
    select.checked = rows.some((checkbox) => checkbox.checked);
  }

  function cancelHoverOpen() {
    if (state.hoverOpenTimer) {
      clearTimeout(state.hoverOpenTimer);
      state.hoverOpenTimer = null;
    }
  }

  function cancelHoverClose() {
    if (state.hoverCloseTimer) {
      clearTimeout(state.hoverCloseTimer);
      state.hoverCloseTimer = null;
    }
  }

  function scheduleHoverClose() {
    cancelHoverClose();
    if (state.mode !== 'peek') {
      return;
    }
    state.hoverCloseTimer = setTimeout(() => {
      state.hoverCloseTimer = null;
      if (state.mode === 'peek') {
        closePreview();
      }
    }, HOVER_CLOSE_DELAY_MS);
  }

  function bulkRunInProgress() {
    const running = window.ChatGPTBulkDelete
      && window.ChatGPTBulkDelete.state
      && window.ChatGPTBulkDelete.state.operationsInProgress;
    return Boolean(running && (running.has('bulkDelete') || running.has('bulkArchive')));
  }

  function openPreview(route, title, mode = 'pinned') {
    // No previews while a bulk delete/archive is running.
    if (!route || bulkRunInProgress()) {
      return;
    }
    cancelHoverOpen();
    cancelHoverClose();
    // Clicking the icon of the conversation already peeking just pins it.
    if (state.panel && route === state.activeRoute) {
      if (mode === 'pinned') {
        state.mode = 'pinned';
      }
      return;
    }
    state.mode = mode;
    if (!state.panel) {
      state.panel = createPanel();
      document.addEventListener('keydown', onKeydown, true);
      state.syncTimer = setInterval(syncSelect, SYNC_INTERVAL_MS);
    }
    const requestId = ++state.requestId;
    state.activeRoute = route;
    state.panel.title.textContent = title || t('preview.untitled');
    state.panel.title.title = title || '';
    state.panel.open.href = routeToUrl(route);
    updatePressedButtons();
    syncSelect();
    loadIntoFrame(route, requestId);
  }

  function closePreview() {
    state.requestId++;
    cancelHoverOpen();
    cancelHoverClose();
    if (state.syncTimer) {
      clearInterval(state.syncTimer);
      state.syncTimer = null;
    }
    state.mode = null;
    stopPolling();
    detachFrameKeyListener();
    document.removeEventListener('keydown', onKeydown, true);
    if (state.panel) {
      state.panel.panel.remove();
      state.panel = null;
    }
    state.activeRoute = null;
    updatePressedButtons();
  }

  function onKeydown(event) {
    // Only the user's own key press closes the preview; the bulk flow sends
    // synthetic Escapes to ChatGPT's dialogs and those must pass through.
    if (event.key === 'Escape' && event.isTrusted && state.panel) {
      event.preventDefault();
      event.stopPropagation();
      closePreview();
    }
  }

  function stopRowEvent(event) {
    // The row is often ChatGPT's <a> (navigation, drag) and our own row
    // click handler toggles the checkbox; the preview icon must do neither.
    event.preventDefault();
    event.stopPropagation();
  }

  const TITLE_START_PX = 54; // checkbox (left 6px, 16px) + icon (left 26px, 22px)

  // Start the title right after the icon. Some rows (chats inside a sidebar
  // project folder) indent their title on their own, so subtract that inner
  // indent instead of stacking our padding on top of it.
  function alignTitle(conversation) {
    conversation.style.paddingInlineStart = `${TITLE_START_PX}px`;
    const link = conversation.matches('a[href*="/c/"]')
      ? conversation
      : conversation.querySelector('a[href*="/c/"]');
    if (!link) {
      return;
    }
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !node.textContent.trim()) {
      // skip whitespace-only nodes
    }
    if (!node) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    const textRect = range.getBoundingClientRect();
    const rowRect = conversation.getBoundingClientRect();
    if (!textRect.width || !rowRect.width) {
      return; // not laid out (hidden row); keep the default padding
    }
    const rtl = window.getComputedStyle(conversation).direction === 'rtl';
    const innerIndent = (rtl ? rowRect.right - textRect.right : textRect.left - rowRect.left) - TITLE_START_PX;
    if (innerIndent > 1) {
      conversation.style.paddingInlineStart = `${Math.max(0, TITLE_START_PX - innerIndent)}px`;
    }
  }

  function addPreviewButton(conversation, route, title) {
    if (!conversation || !route) {
      return null;
    }
    injectStyles();
    alignTitle(conversation);
    conversation.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
    title = rowTitle(conversation, title);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.dataset.route = route;
    button.title = t('preview.button');
    button.setAttribute('aria-label', t('preview.button'));
    button.setAttribute('aria-pressed', String(route === state.activeRoute));
    button.innerHTML = EYE_ICON;

    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dragstart'].forEach((type) => {
      button.addEventListener(type, (event) => event.stopPropagation());
    });
    button.addEventListener('click', (event) => {
      stopRowEvent(event);
      openPreview(route, title, 'pinned');
    });
    button.addEventListener('mouseenter', () => {
      cancelHoverClose();
      // A pinned preview is only replaced by an explicit click.
      if (state.mode === 'pinned') {
        return;
      }
      cancelHoverOpen();
      state.hoverOpenTimer = setTimeout(() => {
        state.hoverOpenTimer = null;
        if (state.mode !== 'pinned') {
          openPreview(route, title, 'peek');
        }
      }, HOVER_OPEN_DELAY_MS);
    });
    button.addEventListener('mouseleave', () => {
      cancelHoverOpen();
      scheduleHoverClose();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        stopRowEvent(event);
        openPreview(route, title, 'pinned');
      }
    });

    // Append only — reordering React's children crashes the sidebar.
    conversation.appendChild(button);
    return button;
  }

  function cleanup() {
    closePreview();
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
    const style = document.getElementById(STYLE_ID);
    if (style) {
      style.remove();
    }
  }

  // New language: relabel the eye icons; an open preview is rebuilt on its
  // next open (closing it is simpler than relabelling every part).
  function relabelButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
      button.title = t('preview.button');
      button.setAttribute('aria-label', t('preview.button'));
    });
  }
  if (window.BDI18n) {
    window.BDI18n.onChange(() => {
      relabelButtons();
      if (state.panel) {
        closePreview();
      }
    });
    if (window.BDI18n.ready) {
      window.BDI18n.ready.then(relabelButtons);
    }
  }

  const ConversationPreview = {
    BUTTON_CLASS,
    addPreviewButton,
    openPreview,
    closePreview,
    cleanup,
    isPreviewControl(element) {
      return Boolean(element && element.closest && element.closest(`.${BUTTON_CLASS}`));
    }
  };

  window.ConversationPreview = ConversationPreview;

  const register = () => {
    if (window.ChatGPTBulkDelete && window.ChatGPTBulkDelete.registerModule) {
      window.ChatGPTBulkDelete.registerModule('ConversationPreview', ConversationPreview);
    } else {
      setTimeout(register, 50);
    }
  };
  register();
})();
