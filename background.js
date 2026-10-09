console.log("Background script loaded");

const DEFAULT_API_BASE = "https://bulk-delete-chatgpt-worker.qcrao.com";
// Developers can point the extension at `wrangler dev` with:
//   chrome.storage.local.set({ BulkDeleteChatGPT_apiBase: "http://localhost:8787" })
const API_BASE_KEY = "BulkDeleteChatGPT_apiBase";
const SESSION_TOKEN_KEY = "BulkDeleteChatGPT_sessionToken";
const ACCOUNT_CACHE_KEY = "BulkDeleteChatGPT_account";
const LEGACY_UPGRADE_KEY = "BulkDeleteChatGPT_legacyUpgraded";
const FALLBACK_USER_INFO_KEY = "BulkDeleteChatGPT_fallbackUserInfo";

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(items) {
  return chrome.storage.local.set(items);
}

function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

async function getApiBase() {
  const result = await storageGet([API_BASE_KEY]);
  return result[API_BASE_KEY] || DEFAULT_API_BASE;
}

// ---------------------------------------------------------------------------
// Legacy identity (v6 and earlier). Only used so that $0.99 buyers can be
// matched and upgraded to Lifetime when they sign in.
// ---------------------------------------------------------------------------

async function getFallbackUserInfo() {
  const result = await storageGet([FALLBACK_USER_INFO_KEY]);
  if (result[FALLBACK_USER_INFO_KEY]?.id) {
    return result[FALLBACK_USER_INFO_KEY];
  }

  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userInfo = { id: `anonymous-${randomId}`, email: "" };
  await storageSet({ [FALLBACK_USER_INFO_KEY]: userInfo });
  return userInfo;
}

function getChromeProfileUserInfo() {
  return new Promise((resolve) => {
    const identityApi = chrome.identity;
    const getProfileUserInfo = identityApi?.["getProfileUserInfo"];

    if (!getProfileUserInfo) {
      resolve(null);
      return;
    }

    getProfileUserInfo.call(
      identityApi,
      { accountStatus: "ANY" },
      (userInfo) => {
        if (chrome.runtime.lastError) {
          console.warn(chrome.runtime.lastError);
          resolve(null);
          return;
        }

        resolve(userInfo?.id ? userInfo : null);
      }
    );
  });
}

async function getUserInfo() {
  return (await getChromeProfileUserInfo()) || getFallbackUserInfo();
}

// ---------------------------------------------------------------------------
// Account API
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || body?.reason || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const base = await getApiBase();
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const { [SESSION_TOKEN_KEY]: token } = await storageGet([SESSION_TOKEN_KEY]);
    if (!token) throw new ApiError(401, { error: "unauthorized" });
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && auth) {
    await storageRemove([SESSION_TOKEN_KEY, ACCOUNT_CACHE_KEY]);
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(chrome.runtime.lastError?.message || "Sign-in was canceled"));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signIn() {
  const base = await getApiBase();
  const state = randomState();
  const legacyUser = await getUserInfo().catch(() => null);

  const startUrl = new URL(`${base}/auth/google/start`);
  startUrl.searchParams.set("redirect_uri", chrome.identity.getRedirectURL());
  startUrl.searchParams.set("state", state);
  if (legacyUser?.id) startUrl.searchParams.set("legacy_uid", legacyUser.id);

  const redirectUrl = new URL(await launchWebAuthFlow(startUrl.toString()));
  if (redirectUrl.searchParams.get("state") !== state) {
    throw new Error("Sign-in failed. Please try again.");
  }
  const error = redirectUrl.searchParams.get("error");
  if (error) throw new Error(`Sign-in failed (${error}).`);

  const { token, legacyUpgraded } = await apiFetch("/auth/exchange", {
    method: "POST",
    body: { code: redirectUrl.searchParams.get("code") },
    auth: false
  });
  await storageSet({
    [SESSION_TOKEN_KEY]: token,
    [LEGACY_UPGRADE_KEY]: Boolean(legacyUpgraded)
  });
  return refreshAccount();
}

async function signOut() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn("Logout request failed:", error);
  }
  await storageRemove([SESSION_TOKEN_KEY, ACCOUNT_CACHE_KEY, LEGACY_UPGRADE_KEY]);
}

async function refreshAccount() {
  const account = await apiFetch("/me");
  await storageSet({
    [ACCOUNT_CACHE_KEY]: { ...account, fetchedAt: Date.now() },
    ...(account.legacyUpgraded ? { [LEGACY_UPGRADE_KEY]: true } : {})
  });
  return account;
}

async function getCachedAccount() {
  const result = await storageGet([SESSION_TOKEN_KEY, ACCOUNT_CACHE_KEY, LEGACY_UPGRADE_KEY]);
  if (!result[SESSION_TOKEN_KEY]) return { signedIn: false };
  return {
    signedIn: true,
    account: result[ACCOUNT_CACHE_KEY] || null,
    legacyUpgraded: Boolean(result[LEGACY_UPGRADE_KEY])
  };
}

const handlers = {
  getUserInfo: async () => ({ userInfo: await getUserInfo() }),
  getCachedAccount: () => getCachedAccount(),
  refreshAccount: async () => ({ account: await refreshAccount() }),
  signIn: async () => ({ account: await signIn() }),
  signOut: async () => {
    await signOut();
    return { success: true };
  },
  dismissLegacyUpgrade: async () => {
    await storageSet({ [LEGACY_UPGRADE_KEY]: false });
    return { success: true };
  },
  claimUsage: async ({ operation }) =>
    apiFetch("/usage/claim", { method: "POST", body: { action: operation } }),
  lifetimeQuote: () => apiFetch("/billing/lifetime-quote"),
  checkout: async ({ plan }) => {
    const { url } = await apiFetch("/billing/checkout", { method: "POST", body: { plan } });
    await chrome.tabs.create({ url });
    return { success: true };
  },
  openPortal: async () => {
    const { url } = await apiFetch("/billing/portal", { method: "POST" });
    await chrome.tabs.create({ url });
    return { success: true };
  }
};

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = handlers[request.action];
  if (!handler) return false;

  Promise.resolve()
    .then(() => handler(request))
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error(`${request.action} failed:`, error);
      sendResponse({
        error: error.message,
        status: error.status || 0,
        body: error.body || null
      });
    });
  return true; // Will respond asynchronously
});

console.log("Background script setup complete");
