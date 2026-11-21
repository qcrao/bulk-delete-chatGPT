/**
 * ChatGPT Bulk Delete - Selection Bar
 *
 * While selection mode is on, shows how many conversations are selected.
 * On the free plan, once the selection is over the per-run limit, it says
 * so before the run (instead of only after it) and offers an upgrade.
 *
 * The popup passes the limit when "Add" is clicked
 * (window.ChatGPTBulkDeleteSelectionInfo.freeMaxPerRun; null for Pro or an
 * unknown account, so nobody is shown an upgrade by mistake).
 */

(function() {
  'use strict';

  if (window.selectionBarLoaded) {
    return;
  }
  window.selectionBarLoaded = true;

  const BAR_ID = 'bulk-delete-selection-bar';
  const STYLE_ID = 'bulk-delete-selection-bar-style';
  const REFRESH_MS = 300;

  let refreshTimer = null;
  let lastRendered = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BAR_ID} {
        /* Top centre: clear of the sidebar rows, the composer and the
           preview panel on the right. */
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147482000;
        max-width: min(560px, calc(100vw - 32px));
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: 10px;
        row-gap: 4px;
        padding: 8px 8px 8px 14px;
        border-radius: 12px;
        background: #0d0d0d;
        color: #fff;
        font-size: 13px;
        line-height: 1.35;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
      }
      #${BAR_ID} .bdsb-count { font-weight: 600; }
      #${BAR_ID} .bdsb-note { opacity: 0.8; }
      #${BAR_ID} .bdsb-upgrade {
        margin-left: auto;
        padding: 6px 10px;
        border: 0;
        border-radius: 8px;
        background: #e8b84a;
        color: #1a1a1a;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      #${BAR_ID} .bdsb-upgrade:hover { filter: brightness(1.05); }
      #${BAR_ID} [hidden] { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Counts conversations, not checkboxes: one chat can be listed twice
  // (project folder + Recents).
  function selectedCount() {
    const routes = new Set();
    let withoutRoute = 0;
    document.querySelectorAll('.conversation-checkbox:checked').forEach((checkbox) => {
      const route = checkbox.dataset.bulkDeleteRoute;
      if (route) {
        routes.add(route);
      } else {
        withoutRoute++;
      }
    });
    return routes.size + withoutRoute;
  }

  function freeLimit() {
    const info = window.ChatGPTBulkDeleteSelectionInfo || {};
    const limit = Number(info.freeMaxPerRun);
    return Number.isFinite(limit) && limit > 0 ? limit : null;
  }

  function createBar() {
    injectStyles();
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    // Never mistaken for ChatGPT UI by the conversation detection.
    bar.dataset.bulkDeleteIgnore = 'true';

    const count = document.createElement('div');
    count.className = 'bdsb-count';

    const note = document.createElement('div');
    note.className = 'bdsb-note';
    note.hidden = true;

    const upgrade = document.createElement('button');
    upgrade.type = 'button';
    upgrade.className = 'bdsb-upgrade';
    upgrade.hidden = true;
    upgrade.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        chrome.runtime.sendMessage({ action: 'openUpgrade' }, () => {
          void chrome.runtime.lastError;
        });
      } catch (error) {
        console.warn('Could not open upgrade:', error);
      }
    });

    bar.append(count, note, upgrade);
    bar.addEventListener('click', (event) => event.stopPropagation());
    document.body.appendChild(bar);
    return bar;
  }

  function render() {
    const bar = document.getElementById(BAR_ID) || createBar();
    const count = selectedCount();
    const limit = freeLimit();
    const overLimit = limit !== null && count > limit;
    // With the preview panel open on the right, centre in the space left of it.
    const panel = document.getElementById('bulk-delete-preview-panel');
    const panelLeft = panel ? Math.round(panel.getBoundingClientRect().left) : 0;
    const key = `${count}|${limit}|${panelLeft}`;
    if (key === lastRendered) {
      return;
    }
    lastRendered = key;
    bar.style.left = panelLeft > 0 ? `${panelLeft / 2}px` : '';
    bar.style.maxWidth = panelLeft > 0 ? `${Math.max(240, panelLeft - 32)}px` : '';

    bar.querySelector('.bdsb-count').textContent =
      `${count} conversation${count === 1 ? '' : 's'} selected`;
    const note = bar.querySelector('.bdsb-note');
    const upgrade = bar.querySelector('.bdsb-upgrade');
    note.hidden = !overLimit;
    upgrade.hidden = !overLimit;
    if (overLimit) {
      note.textContent = `Free plan deletes the first ${limit}.`;
      upgrade.textContent = `Upgrade to delete all ${count}`;
    }
  }

  const SelectionBar = {
    start() {
      lastRendered = null;
      render();
      if (!refreshTimer) {
        // Checkboxes change through clicks, Shift ranges, "Toggle" and
        // re-renders, most without events.
        refreshTimer = setInterval(render, REFRESH_MS);
      }
    },
    stop() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      lastRendered = null;
      const bar = document.getElementById(BAR_ID);
      if (bar) {
        bar.remove();
      }
      const style = document.getElementById(STYLE_ID);
      if (style) {
        style.remove();
      }
    },
    selectedCount
  };

  window.SelectionBar = SelectionBar;

  const register = () => {
    if (window.ChatGPTBulkDelete && window.ChatGPTBulkDelete.registerModule) {
      window.ChatGPTBulkDelete.registerModule('SelectionBar', SelectionBar);
    } else {
      setTimeout(register, 50);
    }
  };
  register();
})();
