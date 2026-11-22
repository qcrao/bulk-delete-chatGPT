if (typeof window.conversationHandlerLoaded === "undefined") {
  console.log("conversationHandler.js loaded");

  window.conversationHandlerLoaded = true;

  // Steps where ChatGPT dropped an interaction on a row that was still there,
  // so trying the same conversation again is likely to work. Not row_detached
  // (the row is gone from the page) or no_route (nothing to verify against).
  const RETRYABLE_STAGES = new Set([
    "menu_button",
    "operation_button",
    "confirm_dialog",
    "dialog_close",
    "not_removed"
  ]);
  // Failures cluster when ChatGPT is throttling; past this, more attempts
  // mostly add load.
  const MAX_RETRIES_PER_RUN = 20;
  // Failures the backend fallback can take over: a click ChatGPT dropped, or a
  // row re-rendered away. Both still have the selected route, which is all the
  // backend needs. Not no_route (nothing to identify the conversation by).
  const API_FALLBACK_STAGES = new Set([...RETRYABLE_STAGES, "row_detached"]);

  // Conversation operation handler
  const ConversationHandler = {
    getDelaySettings() {
      const delayConfig = UI_CONFIG.OPERATION_DELAY;
      const operationSettings = window.ChatGPTBulkDeleteOperationSettings || {};
      const rawBaseDelay = Number(operationSettings.baseDelayMs);
      const baseDelayMs = Math.min(
        delayConfig.MAX_BASE_DELAY_MS,
        Math.max(
          delayConfig.MIN_BASE_DELAY_MS,
          Number.isFinite(rawBaseDelay)
            ? rawBaseDelay
            : delayConfig.DEFAULT_BASE_DELAY_MS
        )
      );

      return {
        baseDelayMs: Math.round(baseDelayMs),
        autoSlowdown:
          typeof operationSettings.autoSlowdown === "boolean"
            ? operationSettings.autoSlowdown
            : delayConfig.DEFAULT_AUTO_SLOWDOWN
      };
    },

    getIntraBatchDelay(settings, batchIndex) {
      if (!settings.autoSlowdown) {
        return settings.baseDelayMs;
      }

      const delayConfig = UI_CONFIG.OPERATION_DELAY;
      const multiplier = 1 + batchIndex * delayConfig.INTRA_BATCH_GROWTH;
      // The cap only limits auto-slowdown growth; never drop below the
      // user-configured base delay.
      return Math.max(
        settings.baseDelayMs,
        Math.min(
          delayConfig.MAX_INTRA_BATCH_DELAY_MS,
          Math.round(settings.baseDelayMs * multiplier)
        )
      );
    },

    getBatchCooldownDelay(settings, completedBatchIndex) {
      if (!settings.autoSlowdown) {
        return settings.baseDelayMs;
      }

      const delayConfig = UI_CONFIG.OPERATION_DELAY;
      const multiplier =
        delayConfig.BATCH_COOLDOWN_BASE_MULTIPLIER +
        completedBatchIndex * delayConfig.BATCH_COOLDOWN_GROWTH_MULTIPLIER;

      return Math.max(
        settings.baseDelayMs,
        Math.min(
          delayConfig.MAX_BATCH_COOLDOWN_MS,
          Math.round(settings.baseDelayMs * multiplier)
        )
      );
    },

    getDelayAfterConversation(settings, currentIndex, totalCount) {
      if (currentIndex >= totalCount - 1) {
        return 0;
      }

      const delayConfig = UI_CONFIG.OPERATION_DELAY;
      const currentBatchIndex = Math.floor(currentIndex / delayConfig.BATCH_SIZE);
      const nextIndex = currentIndex + 1;
      const startsNextBatch = nextIndex % delayConfig.BATCH_SIZE === 0;

      if (startsNextBatch) {
        return this.getBatchCooldownDelay(settings, currentBatchIndex);
      }

      return this.getIntraBatchDelay(settings, currentBatchIndex);
    },

    // Base conversation operation
    async performOperation(operation, selectedConversations, buttonId) {
      // The preview panel must not sit over the sidebar while rows are
      // being deleted/archived.
      const preview = window.ChatGPTBulkDelete && window.ChatGPTBulkDelete.getModule
        ? window.ChatGPTBulkDelete.getModule('ConversationPreview')
        : null;
      if (preview && preview.closePreview) {
        preview.closePreview();
      }

      if (selectedConversations.length === 0) {
        console.log(`No conversations to ${operation.toLowerCase()}.`);
        CommonUtils.removeAllCheckboxes();
        const emptyResult = { processedCount: 0, skippedCount: 0, totalCount: 0 };
        ChromeUtils.sendComplete(buttonId, emptyResult);
        return emptyResult;
      }

      // One chat can be listed twice (project folder + Recents); count and
      // process it once, so the free cap and the "N selected" bar agree.
      const seenRoutes = new Set();
      selectedConversations = selectedConversations.filter((checkbox) => {
        const route = checkbox && checkbox.dataset ? checkbox.dataset.bulkDeleteRoute : null;
        if (!route) {
          return true;
        }
        if (seenRoutes.has(route)) {
          return false;
        }
        seenRoutes.add(route);
        return true;
      });

      // Free plan: the popup passes maxPerRun; only the first N selected are processed.
      const maxPerRun = Number((window.ChatGPTBulkDeleteOperationSettings || {}).maxPerRun);
      let limitedFrom = 0;
      if (Number.isFinite(maxPerRun) && maxPerRun > 0 && selectedConversations.length > maxPerRun) {
        limitedFrom = selectedConversations.length;
        selectedConversations = selectedConversations.slice(0, maxPerRun);
      }

      // Pick up selector fixes published since the page was opened.
      await window.RemoteConfig?.refresh({ fresh: true });

      console.log(`Selected conversations for ${operation}:`, selectedConversations.length);
      ChromeUtils.sendProgress(buttonId, 0);
      
      // Send analytics event
      await APIUtils.sendEvent(EVENTS[operation.toUpperCase()], selectedConversations.length);

      let processedCount = 0;
      let skippedCount = 0;
      const failures = [];
      const delaySettings = this.getDelaySettings();
      console.log(
        `${operation} delay settings:`,
        delaySettings,
        `batch size: ${UI_CONFIG.OPERATION_DELAY.BATCH_SIZE}`
      );

      // Routes deleted/archived in this run, so a conversation selected twice
      // (sidebar and project list) is not reported as a failure the second time.
      const handledRoutes = new Set();

      // Sidebar clicks first; the backend only takes over what they could not do.
      const apiRun = this.createApiRun();
      const switchAfter = UI_CONFIG.API_FALLBACK.SWITCH_AFTER_CONSECUTIVE_FAILURES;
      let consecutiveFallbackFailures = 0;
      // Every sidebar failure, kept even when the backend rescues it: the
      // diagnostics are how we learn the sidebar selectors broke.
      const domFailures = [];

      for (let i = 0; i < selectedConversations.length; i++) {
        const checkbox = selectedConversations[i];
        const selectedRoute = checkbox?.dataset?.bulkDeleteRoute || null;
        let apiFailure = null;
        if (apiRun.useForRest) {
          const outcome = await this.processViaApi(operation, selectedRoute, handledRoutes, apiRun);
          if (outcome.ok) {
            processedCount++;
          } else {
            // Try the sidebar for this one; once the backend is stopped, the
            // rest of the run goes back to the sidebar too.
            apiFailure = outcome.failure;
            if (apiRun.stoppedBy) apiRun.useForRest = false;
          }
        }
        if (!apiRun.useForRest || apiFailure) {
          let failure = null;
          try {
            const result = await this.processConversation(operation, checkbox, handledRoutes);
            if (result.ok) {
              processedCount++;
            } else {
              failure = { ...result.failure, route: result.route || selectedRoute };
            }
          } catch (error) {
            console.error(`Error processing conversation ${i + 1}:`, error);
            failure = { stage: error.stage || "unknown", message: error.message, route: selectedRoute };
          }

          if (failure) {
            skippedCount++;
            // apiFailure: the backend already had its go at this one.
            failure = { ...failure, index: i + 1, checkbox, apiFailure };
            failures.push(failure);
            domFailures.push(failure);
          }
          const fallbackable = Boolean(failure && failure.route && API_FALLBACK_STAGES.has(failure.stage));
          consecutiveFallbackFailures = fallbackable ? consecutiveFallbackFailures + 1 : 0;
          if (apiRun.enabled && !apiRun.useForRest && !apiRun.stoppedBy && consecutiveFallbackFailures >= switchAfter) {
            console.log(
              `${consecutiveFallbackFailures} sidebar failures in a row; using ChatGPT's backend for the rest of this run`
            );
            apiRun.useForRest = true;
            apiRun.stats.switchedEarly = true;
          }
        }

        // Update progress
        // Reserve 100% for a genuinely successful completion signal.
        const progress = Math.min(
          99,
          Math.round(((i + 1) / selectedConversations.length) * 100)
        );
        ChromeUtils.sendProgress(buttonId, progress);

        // Throttle between operations to avoid ChatGPT rate limiting.
        // Skip the wait after the final item.
        const delayAfterConversation = this.getDelayAfterConversation(
          delaySettings,
          i,
          selectedConversations.length
        );
        if (delayAfterConversation > 0) {
          await CommonUtils.delay(delayAfterConversation);
        }
      }

      // ChatGPT now and then swallows a click (the menu doesn't open, or closes
      // without opening the confirm dialog), in foreground and background tabs
      // alike. One more pass over those items clears most of them. A route
      // selected twice is retried once and the outcome applies to both copies.
      //
      // With the backend fallback available, those items (and rows that were
      // re-rendered away) go to ChatGPT's backend instead, with no per-run cap:
      // when ChatGPT changes its UI every item fails, not just a few.
      const lastBatchIndex = Math.floor(
        (selectedConversations.length - 1) / UI_CONFIG.OPERATION_DELAY.BATCH_SIZE
      );
      if (apiRun.enabled) {
        const byRoute = new Map();
        for (const failure of failures) {
          if (!failure.route || failure.apiFailure || !API_FALLBACK_STAGES.has(failure.stage)) continue;
          if (!byRoute.has(failure.route)) byRoute.set(failure.route, []);
          byRoute.get(failure.route).push(failure);
        }
        if (byRoute.size > 0) {
          console.log(`Retrying ${byRoute.size} failed conversation(s) through ChatGPT's backend...`);
        }
        let attempted = 0;
        for (const [route, copies] of byRoute) {
          if (attempted > 0) {
            await CommonUtils.delay(this.getIntraBatchDelay(delaySettings, lastBatchIndex));
          }
          attempted++;
          const outcome = await this.processViaApi(operation, route, handledRoutes, apiRun);
          for (const failure of copies) {
            const position = failures.indexOf(failure);
            if (outcome.ok) {
              failures.splice(position, 1);
              processedCount++;
              skippedCount--;
            } else if (RETRYABLE_STAGES.has(failure.stage)) {
              // Keep the sidebar stage so the sidebar retry below still runs:
              // with the backend blocked, it is the last chance for this item.
              failures[position] = { ...failure, apiFailure: outcome.failure };
            } else {
              failures[position] = { ...outcome.failure, index: failure.index, checkbox: failure.checkbox, route };
            }
          }
        }
      }

      // Sidebar retry (7.8): everything when the backend fallback is off,
      // otherwise only what the backend could not rescue.
      const retryByRoute = new Map();
      for (const failure of failures) {
        if (!failure.route || handledRoutes.has(failure.route) || !RETRYABLE_STAGES.has(failure.stage)) continue;
        if (!retryByRoute.has(failure.route)) {
          if (retryByRoute.size >= MAX_RETRIES_PER_RUN) continue;
          retryByRoute.set(failure.route, []);
        }
        retryByRoute.get(failure.route).push(failure);
      }
      let retriedCount = 0;
      if (retryByRoute.size > 0) {
        console.log(`Retrying ${retryByRoute.size} failed conversation(s)...`);
        await CommonUtils.delay(this.getBatchCooldownDelay(delaySettings, lastBatchIndex));
      }
      for (const [route, copies] of retryByRoute) {
        if (retriedCount > 0) {
          await CommonUtils.delay(this.getIntraBatchDelay(delaySettings, lastBatchIndex));
        }
        retriedCount++;
        // No shortcut when the row is gone: the sidebar drops rows wholesale,
        // so absence alone doesn't prove the first attempt went through.
        // processConversation reports row_detached then.
        let retryFailure = null;
        if (!handledRoutes.has(route)) {
          try {
            const result = await this.processConversation(
              operation,
              copies[0].checkbox,
              handledRoutes
            );
            retryFailure = result.ok ? null : result.failure;
          } catch (error) {
            console.error("Error retrying conversation:", error);
            retryFailure = { stage: error.stage || "unknown", message: error.message };
          }
        }

        for (const failure of copies) {
          const position = failures.indexOf(failure);
          if (retryFailure) {
            failures[position] = { ...retryFailure, index: failure.index, retried: true, apiFailure: failure.apiFailure };
          } else {
            failures.splice(position, 1);
            processedCount++;
            skippedCount--;
          }
        }
      }

      console.log(`${operation} completed: ${processedCount} processed, ${skippedCount} skipped`);
      const reloadPage = apiRun.doneIds.length > 0;
      const result = {
        processedCount,
        skippedCount,
        totalCount: selectedConversations.length,
        limitedFrom,
        pageReload: reloadPage
      };
      ChromeUtils.sendComplete(buttonId, result);
      // Also when the backend rescued everything: the sidebar failures are
      // still the signal that ChatGPT's UI changed.
      if (failures.length > 0 || domFailures.length > 0) {
        this.reportFailures(operation, result, failures, retriedCount, { domFailures, api: apiRun.stats });
      }
      if (reloadPage) {
        this.reloadAfterApiRun(apiRun.doneIds);
      }
      return result;
    },

    // State for one run's backend fallback.
    createApiRun() {
      const api = window.ChatGPTApi;
      const enabled = Boolean(api && api.isAvailable());
      return {
        enabled,
        useForRest: false,
        // Set on 403 or too many 429s: no more backend requests this run.
        stoppedBy: null,
        rateLimitHits: 0,
        // Doubles on every 429, widening the gap between backend requests.
        gapMultiplier: 1,
        // Conversation ids the backend deleted/archived, for the reload.
        doneIds: [],
        stats: { enabled, attempted: 0, rescued: 0, failed: 0, switchedEarly: false, stoppedBy: null, results: {} }
      };
    },

    // Deletes/archives one selected conversation through ChatGPT's backend.
    // The id only ever comes from the route recorded when the user ticked the
    // checkbox, never from whatever row is on screen now (rows get reused).
    async processViaApi(operation, route, handledRoutes, apiRun) {
      const api = window.ChatGPTApi;
      const fail = (stage, message) => {
        apiRun.stats.failed++;
        return { ok: false, failure: { stage, message } };
      };
      if (route && handledRoutes.has(route)) {
        return { ok: true };
      }
      if (apiRun.stoppedBy) {
        return fail("api_stopped", `Backend requests stopped for this run (${apiRun.stoppedBy})`);
      }
      const conversationId = api.conversationIdFromRoute(route);
      if (!conversationId) {
        return fail("api_no_id", "Selected link is not a conversation link");
      }

      const settings = UI_CONFIG.API_FALLBACK;
      const baseGapMs = Math.max(settings.MIN_GAP_MS, this.getDelaySettings().baseDelayMs);
      apiRun.stats.attempted++;
      let result;
      while (true) {
        result = await api.perform(operation, conversationId, { minGapMs: baseGapMs * apiRun.gapMultiplier });
        if (result.status !== 429) break;
        // Counted per run, not per item: every item hitting 429 once and then
        // succeeding would otherwise keep the run pressed against the limit.
        this.countApiResult(apiRun, result);
        apiRun.rateLimitHits++;
        apiRun.gapMultiplier = Math.min(settings.RATE_LIMIT_MAX_GAP_MULTIPLIER, apiRun.gapMultiplier * 2);
        if (apiRun.rateLimitHits >= settings.RATE_LIMIT_MAX_HITS_PER_RUN) {
          apiRun.stoppedBy = apiRun.stats.stoppedBy = "rate_limit";
          apiRun.stats.failed++;
          return { ok: false, failure: { stage: "api_rate_limited", message: "ChatGPT rate limited backend requests" } };
        }
        const pauseMs = Math.min(
          settings.RATE_LIMIT_MAX_PAUSE_MS,
          Math.max(settings.RATE_LIMIT_MIN_PAUSE_MS, result.retryAfterMs ?? settings.RATE_LIMIT_DEFAULT_PAUSE_MS)
        );
        console.warn(
          `ChatGPT is rate limiting (429); pausing ${Math.round(pauseMs / 1000)}s, then ${apiRun.gapMultiplier}x slower`
        );
        await CommonUtils.delay(pauseMs);
      }
      if (result.status === 403) {
        // Blocked or a challenge page: more requests won't help.
        apiRun.stoppedBy = apiRun.stats.stoppedBy = "forbidden";
      }
      this.countApiResult(apiRun, result);

      if (result.ok) {
        apiRun.stats.rescued++;
        apiRun.doneIds.push(conversationId);
        handledRoutes.add(route);
        this.hideHandledConversation(route, conversationId);
        return { ok: true };
      }
      return fail("api_request", `HTTP ${result.status}${result.code ? ` ${result.code}` : ""}`);
    },

    countApiResult(apiRun, result) {
      const key = `${result.status}${result.code ? `:${result.code}` : ""}`;
      apiRun.stats.results[key] = (apiRun.stats.results[key] || 0) + 1;
    },

    // The sidebar doesn't know about backend changes until the page reloads:
    // hide the row now and untick its checkboxes so the selected count is right.
    hideHandledConversation(route, conversationId) {
      try {
        let style = document.getElementById("bulk-delete-api-hidden");
        if (!style) {
          style = document.createElement("style");
          style.id = "bulk-delete-api-hidden";
          (document.head || document.documentElement).appendChild(style);
        }
        // conversationId is a validated UUID, safe inside the selector.
        const link = `a[href$="/c/${conversationId}"]`;
        style.textContent += `${link}, li:has(${link}), [data-bulk-delete-conversation-owner="true"]:has(${link}) { display: none !important; }\n`;
        document.querySelectorAll(".conversation-checkbox").forEach((checkbox) => {
          if (checkbox.dataset.bulkDeleteRoute === route && checkbox.checked) {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
      } catch (error) {
        console.warn("Could not hide a conversation handled through the backend:", error);
      }
    },

    // Reload so ChatGPT's sidebar shows the backend changes. If the open
    // conversation was just deleted/archived, go to a new chat instead.
    reloadAfterApiRun(conversationIds) {
      const delay = UI_CONFIG.API_FALLBACK.RELOAD_DELAY_MS;
      console.log(`Reloading ChatGPT in ${delay}ms to refresh the sidebar`);
      setTimeout(() => {
        const openId = window.ChatGPTApi.conversationIdFromRoute(window.location.pathname);
        if (openId && conversationIds.includes(openId)) {
          window.location.assign("/");
        } else {
          window.location.reload();
        }
      }, delay);
    },

    // Fire-and-forget: tells us when ChatGPT's UI changed and broke a step.
    // Only UI labels, step names and HTTP status codes are sent, never
    // conversation titles or ids.
    reportFailures(operation, result, failures, retriedCount = 0, { domFailures = failures, api = null } = {}) {
      const countStages = (list) => {
        const counts = {};
        for (const failure of list) counts[failure.stage] = (counts[failure.stage] || 0) + 1;
        return counts;
      };
      const stageCounts = countStages(failures);
      const report = {
        operation,
        total: result.totalCount,
        // Still failing after every fallback.
        failed: result.skippedCount,
        retried: retriedCount,
        stageCounts,
        // What the sidebar clicks hit, before the backend took over.
        domFailed: domFailures.length,
        domStageCounts: countStages(domFailures),
        api,
        errors: [...new Set(
          [...failures, ...domFailures].flatMap((failure) => [failure.message, failure.apiFailure?.message])
        )].filter(Boolean).slice(0, 5),
        menuItems: domFailures.find((failure) => failure.menuItems)?.menuItems || [],
        // Which item failed, how long the step waited and what was on screen,
        // to tell a slow/unopened dialog from one the selectors don't match.
        diagnostics: (domFailures.length ? domFailures : failures).slice(0, 5).map((failure) => ({
          index: failure.index || null,
          stage: failure.stage,
          retried: Boolean(failure.retried),
          waitedMs: failure.waitedMs ?? null,
          menuItemCount: failure.menuItemCount ?? null,
          tabHidden: failure.tabHidden ?? null,
          confirmPolls: failure.confirmPolls ?? null,
          confirmSelectorMatches: failure.confirmSelectorMatches ?? null,
          dialogs: failure.dialogs || []
        })),
        uiLang: document.documentElement.lang || navigator.language || null,
        uiConfigVersion: window.RemoteConfig?.version || null
      };
      try {
        chrome.runtime.sendMessage({ action: "reportFailure", report }, () => {
          void chrome.runtime.lastError;
        });
      } catch (error) {
        console.warn("Could not send failure report:", error);
      }
    },

    // Process individual conversation
    async processConversation(operation, checkbox, handledRoutes = null) {
      // Already done in this run (e.g. by the backend fallback, whose rows stay
      // in the DOM, hidden, until the page reloads).
      if (handledRoutes && checkbox.dataset.bulkDeleteRoute && handledRoutes.has(checkbox.dataset.bulkDeleteRoute)) {
        return { ok: true };
      }
      // A dialog left open by the previous item would swallow this item's clicks.
      await this.closeLingeringDialogs();
      await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);

      // The route stored when the checkbox was created identifies what the user
      // selected. ChatGPT re-renders sidebar rows during a long run, which can
      // detach the checkbox or reuse its row for a different conversation.
      const selectedRoute = checkbox.dataset.bulkDeleteRoute || null;
      let conversationElement = checkbox.isConnected
        ? DOMHandler.getConversationElementFromCheckbox(checkbox)
        : null;
      if (
        conversationElement
        && selectedRoute
        && DOMHandler.getConversationRoute(conversationElement) !== selectedRoute
      ) {
        conversationElement = null;
      }
      if (!conversationElement && selectedRoute) {
        if (handledRoutes && handledRoutes.has(selectedRoute)) {
          return { ok: true };
        }
        conversationElement = await this.waitForConversationElementByRoute(selectedRoute);
      }
      if (!conversationElement) {
        return {
          ok: false,
          failure: {
            stage: "row_detached",
            message: selectedRoute
              ? "Conversation row was re-rendered and could not be found again"
              : "Conversation row was re-rendered and its link was never recorded",
            ...this.captureFailureSnapshot(Date.now())
          }
        };
      }
      const conversationRoute = selectedRoute
        || DOMHandler.getConversationRoute(conversationElement);
      const markHandled = () => {
        if (handledRoutes && conversationRoute) {
          handledRoutes.add(conversationRoute);
        }
      };
      const interactiveElement = DOMHandler.findInteractiveElement(conversationElement)
        || conversationElement;

      let stage = "menu_button";
      let menuItems = null;
      let stageStartedAt = Date.now();
      try {
        // Hover to reveal menu
        console.log(`1. Hovering over conversation...`);
        DOMHandler.dispatchHoverEvent(conversationElement);
        DOMHandler.dispatchHoverEvent(interactiveElement);
        await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);

        const threeDotButton = await this.waitForConversationMenuButton(
          conversationElement,
          operation === 'DELETE' ? UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT : UI_CONFIG.TIMEOUTS.ELEMENT_WAIT
        );

        stage = "operation_button";
        stageStartedAt = Date.now();
        const operationButton = await this.openConversationMenu(
          threeDotButton,
          operation
        );
        if (!operationButton) {
          menuItems = this.logVisibleMenuItems();
          throw new Error(`${operation} button not found`);
        }

        await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);
        console.log(`3. Clicking ${operation.toLowerCase()} button...`);
        if (threeDotButton.id.startsWith("--native-popover-")) {
          operationButton.click();
        } else {
          DOMHandler.dispatchClickSequence(operationButton);
        }

        if (operation === 'DELETE') {
          // ChatGPT can leave the previous dialog's button in the DOM, so only
          // the visible confirm button belongs to this conversation.
          stage = "confirm_dialog";
          stageStartedAt = Date.now();
          const confirmButton = await this.waitForVisibleConfirmButton();
          if (!confirmButton) {
            throw new Error("Delete confirmation dialog did not appear");
          }
          await CommonUtils.delay(UI_CONFIG.DELAYS.MEDIUM);
          console.log(`4. Clicking confirm button...`);
          DOMHandler.dispatchClickSequence(confirmButton);
          stage = "dialog_close";
          stageStartedAt = Date.now();
          const closed = await this.waitForElementHidden(
            confirmButton,
            UI_CONFIG.TIMEOUTS.CONFIRM_DIALOG_CLOSE
          );
          if (!closed) {
            throw new Error("Delete confirmation dialog did not close");
          }
        } else {
          await CommonUtils.delay(UI_CONFIG.DELAYS.EXTENDED);
        }

        stageStartedAt = Date.now();
        if (await this.verifyConversationOperation(operation, conversationRoute)) {
          markHandled();
          return { ok: true };
        }
        const snapshot = this.captureFailureSnapshot(stageStartedAt);
        return {
          ok: false,
          route: conversationRoute,
          failure: conversationRoute
            ? { stage: "not_removed", message: "Conversation still listed after the operation", ...snapshot }
            : { stage: "no_route", message: "Could not read the conversation link to verify the result", ...snapshot }
        };
      } catch (error) {
        // Before verifying and closing dialogs, which change what is on screen.
        const snapshot = this.captureFailureSnapshot(stageStartedAt, stage);
        const succeeded = await this.verifyConversationOperation(operation, conversationRoute);
        await this.closeLingeringDialogs();
        if (succeeded) {
          console.log(
            `${operation} succeeded despite an interrupted DOM interaction:`,
            conversationRoute
          );
          markHandled();
          return { ok: true };
        }

        console.log(`Could not complete ${operation.toLowerCase()} process:`, error);
        return {
          ok: false,
          route: conversationRoute,
          failure: { stage, message: error.message, menuItems, ...snapshot }
        };
      }
    },

    // The row may be between unmount and remount right after the previous delete.
    async waitForConversationElementByRoute(route, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT) {
      if (!DOMHandler.findConversationElementByRoute) {
        return null;
      }
      const startedAt = Date.now();
      while (true) {
        const element = DOMHandler.findConversationElementByRoute(route);
        if (element || Date.now() - startedAt >= timeout) {
          return element;
        }
        await CommonUtils.delay(UI_CONFIG.DELAYS.SHORT);
      }
    },

    // What the page showed when a step failed. Only structure and button
    // labels of open dialogs, never conversation titles or ids.
    captureFailureSnapshot(stageStartedAt, stage) {
      const snapshot = { waitedMs: Date.now() - stageStartedAt };
      try {
        const clip = (value, max) => String(value || "").trim().slice(0, max) || null;
        snapshot.menuItemCount = Array.from(
          document.querySelectorAll(UI_CONFIG.SELECTORS.MENU_ITEM)
        ).filter((item) => CommonUtils.isElementVisible(item)).length;
        snapshot.tabHidden = document.visibilityState === "hidden";
        snapshot.confirmPolls = stage === "confirm_dialog" ? this.confirmPolls ?? null : null;
        snapshot.confirmSelectorMatches = document.querySelectorAll(
          UI_CONFIG.SELECTORS.confirmDeleteButton
        ).length;
        snapshot.dialogs = Array.from(
          document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
        )
          .filter((dialog) => CommonUtils.isElementVisible(dialog))
          .slice(-3)
          .map((dialog) => ({
            role: dialog.getAttribute("role"),
            tag: dialog.tagName.toLowerCase(),
            ariaHidden: dialog.getAttribute("aria-hidden"),
            state: dialog.getAttribute("data-state"),
            testId: clip(dialog.dataset.testid, 60),
            buttons: Array.from(dialog.querySelectorAll("button"))
              .slice(0, 6)
              .map((button) => ({
                text: clip(button.textContent, 30),
                testId: clip(button.dataset.testid, 60),
                type: button.getAttribute("type"),
                cls: clip(button.getAttribute("class"), 160),
                visible: CommonUtils.isElementVisible(button)
              }))
          }));
      } catch (error) {
        console.warn("Could not capture failure snapshot:", error);
      }
      return snapshot;
    },

    findVisibleConfirmButton() {
      const visible = Array.from(
        document.querySelectorAll(UI_CONFIG.SELECTORS.confirmDeleteButton)
      ).filter((button) => CommonUtils.isElementVisible(button));
      // The newest dialog is rendered last.
      return visible[visible.length - 1] || null;
    },

    // Background tabs throttle timers to about one per second, both ours and
    // ChatGPT's, so the dialog can take several seconds to show up there.
    async waitForVisibleConfirmButton(timeout = UI_CONFIG.TIMEOUTS.CONFIRM_DIALOG_OPEN) {
      this.confirmPolls = 0;
      return CommonUtils.pollUntil(() => {
        this.confirmPolls += 1;
        return this.findVisibleConfirmButton();
      }, timeout);
    },

    async waitForElementHidden(element, timeout) {
      return Boolean(await CommonUtils.pollUntil(
        () => !element.isConnected || !CommonUtils.isElementVisible(element),
        timeout
      ));
    },

    // Waits for a still-open confirm dialog to finish, then dismisses it if it
    // stays open (Escape, then its first non-confirm button, i.e. Cancel / X).
    async closeLingeringDialogs() {
      const button = this.findVisibleConfirmButton();
      const dialog = button?.closest('[role="dialog"]');
      if (!dialog) {
        await this.escapeUnrecognizedDialog();
        return;
      }

      if (await this.waitForElementHidden(button, UI_CONFIG.TIMEOUTS.ELEMENT_WAIT)) return;

      console.log("Closing a delete dialog that is still open...");
      DOMHandler.dispatchEscapeKey(dialog);
      if (await this.waitForElementHidden(button, UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT)) return;

      const dismiss = Array.from(dialog.querySelectorAll("button")).find(
        (candidate) => candidate !== button && CommonUtils.isElementVisible(candidate)
      );
      if (dismiss) {
        DOMHandler.dispatchClickSequence(dismiss);
        await this.waitForElementHidden(button, UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT);
      }
    },

    // The confirm selector no longer matches (ChatGPT changed the dialog), so
    // the dialog can't be found through its button. Only press Escape: clicking
    // an unrecognized button could be the destructive one.
    async escapeUnrecognizedDialog() {
      const dialog = Array.from(
        document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
      ).filter((candidate) => CommonUtils.isElementVisible(candidate)).pop();
      if (!dialog) return;

      console.log("Closing an open dialog the extension does not recognize...");
      DOMHandler.dispatchEscapeKey(dialog);
      await this.waitForElementHidden(dialog, UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT);
    },

    async verifyConversationOperation(operation, conversationRoute) {
      if (!conversationRoute) {
        return operation !== "DELETE";
      }

      return Boolean(await CommonUtils.pollUntil(
        () => !DOMHandler.isConversationRoutePresent(conversationRoute),
        UI_CONFIG.TIMEOUTS.ELEMENT_WAIT
      ));
    },

    async openConversationMenu(menuButton, operation) {
      console.log(`2. Opening three-dot menu with pointerdown...`);
      DOMHandler.dispatchPointerDownEvent(menuButton);

      let operationButton = await this.waitForOperationButton(
        operation,
        document,
        UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT
      );
      if (operationButton) {
        return operationButton;
      }

      console.log(`2b. Pointerdown did not open menu, retrying with keyboard...`);
      DOMHandler.dispatchEnterKey(menuButton);
      operationButton = await this.waitForOperationButton(
        operation,
        document,
        UI_CONFIG.TIMEOUTS.ELEMENT_WAIT_SHORT
      );
      if (operationButton) {
        return operationButton;
      }

      console.log(`2c. Keyboard did not open menu, retrying with click sequence...`);
      DOMHandler.dispatchClickSequence(menuButton);
      await CommonUtils.delay(UI_CONFIG.DELAYS.LONG);
      operationButton = await this.waitForOperationButton(operation);
      return operationButton;
    },

    logVisibleMenuItems() {
      const menuItems = Array.from(
        document.querySelectorAll(UI_CONFIG.SELECTORS.MENU_ITEM)
      ).filter((item) => CommonUtils.isElementVisible(item));

      console.log(
        "Visible menu items after opening conversation menu:",
        menuItems.map((item) => ({
          text: item.textContent.trim(),
          testId: item.dataset.testid || null,
          role: item.getAttribute("role")
        }))
      );
      return menuItems.map((item) => ({
        text: item.textContent.trim().slice(0, 60),
        testId: item.dataset.testid || null,
        role: item.getAttribute("role")
      }));
    },

    async waitForConversationMenuButton(conversationElement, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      const menuButton = await CommonUtils.pollUntil(
        () =>
          DOMHandler.findConversationMenuButton
            ? DOMHandler.findConversationMenuButton(conversationElement)
            : conversationElement.querySelector(UI_CONFIG.SELECTORS.threeDotButton),
        timeout
      );
      if (menuButton) return menuButton;

      throw new Error(`Conversation menu button not found within ${timeout}ms`);
    },

    // Wait for operation-specific button using improved strategies
    async waitForOperationButton(operation, parent = document, timeout = UI_CONFIG.TIMEOUTS.ELEMENT_WAIT) {
      try {
        // Try strategy-based approach first (language-independent)
        return await CommonUtils.waitForElementByStrategy(operation, parent, timeout);
      } catch (error) {
        console.warn(`Strategy-based approach failed for ${operation}:`, error);
        
        // Fallback to legacy text-based approach
        const selector = UI_CONFIG.SELECTORS.MENU_ITEM;
        let textOptions;

        if (operation === 'DELETE') {
          textOptions = [
            UI_CONFIG.STRINGS.DELETE,
            UI_CONFIG.STRINGS.DELETE_CN,
            UI_CONFIG.STRINGS.DELETE_TW,
            UI_CONFIG.STRINGS.DELETE_JP,
            UI_CONFIG.STRINGS.DELETE_KR,
            UI_CONFIG.STRINGS.DELETE_DE,
            UI_CONFIG.STRINGS.DELETE_FR,
            UI_CONFIG.STRINGS.DELETE_ES,
            UI_CONFIG.STRINGS.DELETE_PT,
            UI_CONFIG.STRINGS.DELETE_IT,
            UI_CONFIG.STRINGS.DELETE_RU
          ];
        } else if (operation === 'ARCHIVE') {
          textOptions = [
            UI_CONFIG.STRINGS.ARCHIVE,
            UI_CONFIG.STRINGS.ARCHIVE_CN,
            UI_CONFIG.STRINGS.ARCHIVE_TW,
            UI_CONFIG.STRINGS.ARCHIVE_JP,
            UI_CONFIG.STRINGS.ARCHIVE_KR,
            UI_CONFIG.STRINGS.ARCHIVE_DE,
            UI_CONFIG.STRINGS.ARCHIVE_FR,
            UI_CONFIG.STRINGS.ARCHIVE_ES,
            UI_CONFIG.STRINGS.ARCHIVE_PT,
            UI_CONFIG.STRINGS.ARCHIVE_IT,
            UI_CONFIG.STRINGS.ARCHIVE_RU
          ];
        }

        console.log(`Falling back to text-based approach for ${operation}`);
        return await CommonUtils.waitForElementByText(selector, textOptions, parent, timeout);
      }
    }
  };

  // Export to global scope
  window.ConversationHandler = ConversationHandler;

} else {
  console.log("conversationHandler.js already loaded, skipping re-initialization");
}
