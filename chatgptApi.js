if (typeof window.chatgptApiLoaded === "undefined") {
  console.log("chatgptApi.js loaded");

  window.chatgptApiLoaded = true;

  // Fallback path for conversations the sidebar clicks could not delete or
  // archive: the same requests ChatGPT's own menu sends (captured 2026-11-22).
  //   delete:  DELETE /backend-api/conversation/id/{id}?delete_generated_artifacts=true&delete_uploaded_artifacts=true
  //   archive: PATCH  /backend-api/conversation/{id}  {"is_archived": true}
  // The session token is read from chatgpt.com, kept in memory for a few
  // minutes, and only ever sent back to chatgpt.com. It is never stored or
  // passed to the extension's own server.

  const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  // "/c/<id>" or a project / GPT chat "/g/<slug>/c/<id>". Nothing else.
  const ROUTE_RE = new RegExp(`^(?:/g/[^/]+)?/c/(${UUID})/?$`, "i");
  const TOKEN_TTL_MS = 5 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 20000;

  let token = null;
  let tokenAt = 0;
  let accountId = null;
  let lastRequestAt = 0;

  function readCookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // Seconds or HTTP date; null when absent or unreadable.
  function parseRetryAfter(value) {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(value);
    return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
  }

  // ChatGPT's error code, only if it looks like one (e.g. "conversation_deleted").
  function readErrorCode(text) {
    try {
      const code = JSON.parse(text)?.detail?.code;
      return typeof code === "string" && /^[a-z0-9_]{1,40}$/.test(code) ? code : null;
    } catch (error) {
      return null;
    }
  }

  const ChatGPTApi = {
    conversationIdFromRoute(route) {
      const match = typeof route === "string" ? route.match(ROUTE_RE) : null;
      return match ? match[1].toLowerCase() : null;
    },

    // Firefox content scripts don't fetch as the page, so ChatGPT would not
    // see the session cookies there; keep the fallback to Chromium for now.
    isAvailable() {
      const features = window.UI_CONFIG?.FEATURES || {};
      return features.API_FALLBACK !== false && !/Firefox\//.test(navigator.userAgent);
    },

    async getToken({ force = false } = {}) {
      if (!force && token && Date.now() - tokenAt < TOKEN_TTL_MS) return token;
      token = null;
      const response = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
      if (!response.ok) {
        throw Object.assign(new Error(`session ${response.status}`), { status: response.status });
      }
      const session = await response.json();
      if (!session || !session.accessToken) {
        throw Object.assign(new Error("not signed in"), { status: 401 });
      }
      token = session.accessToken;
      tokenAt = Date.now();
      accountId = session.account?.id || null;
      return token;
    },

    // Never two requests closer than minGapMs, whatever the caller's pacing.
    async waitForGap(minGapMs) {
      const wait = lastRequestAt + minGapMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt = Date.now();
    },

    async send(method, path, body, minGapMs) {
      await this.waitForGap(minGapMs);
      const headers = { Authorization: `Bearer ${await this.getToken()}` };
      if (body) headers["Content-Type"] = "application/json";
      if (accountId) headers["chatgpt-account-id"] = accountId;
      const deviceId = readCookie("oai-did");
      if (deviceId) headers["oai-device-id"] = deviceId;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`/backend-api${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          credentials: "include",
          cache: "no-store",
          signal: controller.signal
        });
        const text = await response.text().catch(() => "");
        return {
          status: response.status,
          code: response.ok ? null : readErrorCode(text),
          retryAfterMs: parseRetryAfter(response.headers.get("retry-after"))
        };
      } catch (error) {
        return { status: 0, code: error.name === "AbortError" ? "timeout" : "network_error", retryAfterMs: null };
      } finally {
        clearTimeout(timer);
      }
    },

    // One conversation. Returns { ok, status, code, retryAfterMs }.
    // `ok` also covers a conversation that is already deleted (an earlier
    // sidebar attempt went through but its row never disappeared).
    async perform(operation, conversationId, { minGapMs = 1000 } = {}) {
      const request = operation === "DELETE"
        ? ["DELETE", `/conversation/id/${conversationId}?delete_generated_artifacts=true&delete_uploaded_artifacts=true`, null]
        : ["PATCH", `/conversation/${conversationId}`, { is_archived: true }];

      let result;
      try {
        result = await this.send(...request, minGapMs);
        if (result.status === 401) {
          // Expired token: fetch a new one and try once more.
          await this.getToken({ force: true });
          result = await this.send(...request, minGapMs);
        } else if (result.status >= 500 || result.status === 0) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          result = await this.send(...request, minGapMs);
        }
      } catch (error) {
        result = { status: error.status || 0, code: "session_error", retryAfterMs: null };
      }

      const alreadyDeleted = operation === "DELETE"
        && result.status === 404
        && result.code === "conversation_deleted";
      return { ...result, ok: (result.status >= 200 && result.status < 300) || alreadyDeleted };
    }
  };

  window.ChatGPTApi = ChatGPTApi;

} else {
  console.log("chatgptApi.js already loaded, skipping re-initialization");
}
