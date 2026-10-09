# v7 订阅制升级 — 技术方案

> 状态：草案（2026-10-09）。标注 **【需确认后执行】** 的步骤会写生产（D1 / Stripe / 部署 / 商店），执行前逐项报副作用并等同意。

## 1. 目标与已定决策

| 项 | 决策 |
|---|---|
| 定价 | Pro 月付 **$4.9** / 年付 **$19.9** / 买断 **$39.9**，所有功能一个档位 |
| 免费版 | Checkbox 操作不限；Bulk Delete **每天 1 次、每次最多 10 条**（服务端计数）；Bulk Archive、无限次数/条数、去广告 → Pro |
| 强制登录 | **所有用户必须登录才能使用任何功能**（包括免费版），未登录时 popup 只显示登录页 |
| 登录 | **仅 Google 登录**（`launchWebAuthFlow`，与浏览器无关：Chrome / Edge / Firefox 通用，任意 Google 账号均可，不要求浏览器已登录 Google） |
| 老用户 | 所有 `paid_users.is_paid=1 AND is_refunded!=1` → 自动转 **买断（Lifetime）** |
| 平台 | Chrome + Edge + Firefox（`manifest.firefox.json` 同步改） |
| 订阅转买断 | 只付差价：**$39.9 − 当前这一期实付金额**（月付补 $35.0，年付补 $20.0）；转换后订阅立即取消、不退款 |

定价策略：年付 $19.9 ≈ 月付 4 个月；买断 = 2 年年付。**有意引导买断**——定价页买断标 BEST VALUE。

## 2. 现状（改动起点）

- 身份：`background.js` 用 `chrome.identity.getProfileUserInfo` 取 Chrome 账号 id，取不到就生成 `anonymous-uuid`。**manifest 缺 `storage` 权限** → 匿名 id 只在内存，SW 重启即漂移 → 付费后解不了锁（历史工单根因）。
- 付费：`popup.js` `MembershipManager` → `GET /check-payment-status?user_id=` ；`POST /pay-bulk-archive` 返回 Stripe **Payment Link** + `client_reference_id`；webhook `checkout.session.completed` 按 `biz_name=bulk-delete-chatgpt` 过滤后 `UPDATE paid_users`。
- 接口全部靠 query 里的 `user_id`，无鉴权。
- Worker：`bulk-delete-chatgpt-worker`（Hono + D1 `bulk_archive_paid_users` + Stripe）。注意现在 `new Stripe(STRIPE_WEBHOOK_SECRET)` 只够验签，**不能调 Stripe API**。

## 3. 总体架构

```
 popup (UI)  ──msg──▶  background SW  ──fetch(Bearer)──▶  Worker (Hono)
   │                     │  chrome.storage.local             ├─ /auth/*        登录/会话
   │                     │   - session token                 ├─ /me            账号+权益
   │                     │   - entitlement 缓存(含过期时间)    ├─ /billing/*     Checkout/Portal
   │                     │   - legacyUid                      ├─ /stripe-webhook
   ▼                     │                                   └─ 旧接口保留(兼容老版本)
 content script ◀── window.ChatGPTBulkDeleteOperationSettings = {…delay, plan, maxPerBatch}
                                                              D1: users / sessions /
                                                                  entitlements / legacy_claims
                                                              Stripe: 3 Prices + Customer Portal
```

原则：
- **token 只存在 background / popup**，绝不注入到 ChatGPT 页面。页面只拿到 `plan` 和 `maxPerBatch`。
- 权益本地缓存 + 定期刷新：popup 打开时先用缓存渲染，再后台拉 `/me`；订阅类权益缓存 `current_period_end + 3 天宽限`，离线也能用。
- 客户端校验可被绕过——这是浏览器插件的天然上限，不做过度防护。

## 4. 登录

### 4.1 Google 登录（Chrome / Edge / Firefox 通用）
1. popup → background：`chrome.identity.launchWebAuthFlow({ url: WORKER/auth/google/start?redirect_uri=<chrome.identity.getRedirectURL()>&state=<随机>, interactive: true })`
2. Worker 生成 PKCE，302 到 Google OAuth（client_id/secret 只在 Worker）。
3. Google 回调 `WORKER/auth/google/callback` → Worker 换 token、取 `email/sub` → upsert `users` → 生成一次性 `code`（60s）→ 302 到 `redirect_uri?code=…&state=…`。
4. background 校验 state，`POST /auth/exchange {code}` → `{ sessionToken, user, entitlement }`。
- `redirect_uri` 白名单：`https://<chrome-ext-id>.chromiumapp.org/`、`https://<firefox-uuid>.extensions.allizom.org/`。
- `identity` 保留（launchWebAuthFlow 需要）；`identity.email` **也要保留**——`getProfileUserInfo` 没有它会返回空 id，老用户的设备自动认领（6-A）就失效了。

### 4.2 会话
- `sessions(token_hash, user_id, created_at, last_seen_at, expires_at)`，token 为 32 字节随机串，只存 hash；有效期 180 天、滑动续期。
- 新接口统一 `Authorization: Bearer <token>`。
- 登出：`POST /auth/logout` 删会话 + 清本地。

## 5. 订阅与支付

### 5.1 Stripe 配置 【需确认后执行】
- 新建 Product「ChatGPT Bulk Delete Pro」，3 个 Price：`monthly $4.9 recurring`、`yearly $19.9 recurring`、`lifetime $39.9 one_time`。Price ID 写进 wrangler vars。
- 开启 Customer Portal（取消/换卡/看发票）。
- 新增 Worker secret `STRIPE_SECRET_KEY`。
- webhook 订阅事件增加：`customer.subscription.created/updated/deleted`、`invoice.paid`、`invoice.payment_failed`、`charge.refunded`。

### 5.2 接口
- `POST /billing/checkout {plan: monthly|yearly|lifetime}` → 服务端创建 Checkout Session：
  - 订阅：`mode=subscription`；买断：`mode=payment`
  - `customer`：已有 `stripe_customer_id` 就复用，否则 `customer_email=user.email`
  - `client_reference_id=user.id`，`metadata.biz_name=bulk-delete-chatgpt`、`metadata.plan`，订阅还要写 `subscription_data.metadata`
  - `success_url=WORKER/billing/done`（静态"可以关闭此页"页），`cancel_url` 同理
- `POST /billing/portal` → 返回 Customer Portal URL。
- `POST /billing/upgrade-lifetime` → 订阅转买断（见 5.5）。
- `POST /usage/claim {action: "delete"}` → 免费用户执行 Bulk Delete **前**调用：服务端在 `usage_daily` 里原子地 +1，当日已用则返回 `429 {reason:"daily_limit", resetsAt}`；Pro 直接放行。日期按 UTC 切分（popup 显示"x 小时后重置"）。
- `GET /me` → `{ user, usage: { deleteRunsLeftToday, resetsAt }, entitlement: { plan: free|monthly|yearly|lifetime, status, source, currentPeriodEnd, cancelAtPeriodEnd } }`

### 5.3 Webhook 处理（关键坑）
- `checkout.session.completed`：按 `client_reference_id` 找用户，**落库 `stripe_customer_id`**；lifetime 直接写 entitlement；subscription 写 `stripe_subscription_id`。
- `customer.subscription.updated/deleted`、`invoice.*` **不带 checkout 的 metadata** → 必须靠 `stripe_customer_id` / `subscription.metadata.user_id` 反查用户。
- 买断用户若还有活跃订阅 → 服务端 `subscriptions.cancel`（立即取消 + 按比例退款与否待定）。
- `charge.refunded` → 对应权益置 `refunded`。
- 幂等：`stripe_events(event_id PRIMARY KEY)` 去重。
- 旧的 Payment Link 事件分支保留，继续写 `paid_users`（兼容期），但同时 grant lifetime（见 6）。

### 5.4 权益计算（单一函数）
```
plan = lifetime 有效 ? lifetime
     : 订阅 status ∈ {active, trialing, past_due(宽限内)} 且 now < current_period_end + 3d ? monthly|yearly
     : free
```

### 5.5 订阅转买断（只付差价）
1. 用户在账户页点 "Go Lifetime"，popup 调 `POST /billing/upgrade-lifetime`。
2. Worker 取该订阅**最近一张已支付发票**（`subscription.latest_invoice`，`status=paid`）的 `amount_paid - 已退款金额` 作为 `paid`。
   - 当期发票未支付（past_due）→ `paid = 0`，按全价 $39.9。
3. `diff = max(3990 - paid, 50)`（单位：美分；Stripe 最低收费 $0.50）：
   - 创建 `mode=payment` 的 Checkout，`line_items: [{ price_data: { currency: 'usd', product: PRO_PRODUCT_ID, unit_amount: diff }, quantity: 1 }]`，`metadata: { plan: 'lifetime', upgrade_from: sub.id }`。
4. webhook `checkout.session.completed` 看到 `upgrade_from` → 发放 lifetime → 立即取消该订阅（`prorate: false`，不退款）。
5. 定价页 / 账户页对订阅用户显示 "Lifetime · 只需再付 $X"（X 由 `GET /billing/lifetime-quote` 返回，和上面同一算法）。

## 6. 老用户 → 买断迁移

三条路径并存，任一命中即发放 `entitlements(plan=lifetime, source=legacy)`：

| 路径 | 机制 |
|---|---|
| A. 设备自动认领 | 登录时 background 把当前 `getUserInfo().id`（Chrome 账号 id / 本地匿名 id）作为 `legacyUid` 一起提交；Worker 查 `paid_users` 命中 → 发放，写 `legacy_claims(legacy_uid UNIQUE, user_id)`，一个 legacyUid 只能认领一次 |
| B. 邮箱匹配 | 一次性回填脚本：遍历 `paid_users` 中有 `stripe_pay_tx_id` 的行 → `stripe.checkout.sessions.retrieve`（只读、免费）→ 取 `customer_details.email` → 写 `legacy_emails(email, legacy_uid)`。任何人用该邮箱登录即自动发放 【回填写 D1，需确认后执行】 |
| C. 人工 | 账户页 "I paid before" → 填付款邮箱 / Stripe 收据号（付款邮箱与 Google 邮箱不同的老用户走这里） → 走现有人工工单流程，后台 `grant` 脚本发放 |

- 口径：`is_paid=1 AND COALESCE(is_refunded,0)=0`，截止到 v7 上线、旧 Payment Link 停用那一刻。
- 认领成功后 popup 弹一次"你已升级为终身版"（见 UI 稿）。
- 强制登录：老付费用户升级到 v7 后也会先看到登录页，登录页明确写"之前付过 $0.99？登录后自动升级为终身版"。路径 A 在登录瞬间完成认领，无需用户额外操作。

## 7. D1 变更 【需确认后执行】

只新增表，`paid_users` 只读保留：

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,               -- uuid
  email TEXT NOT NULL UNIQUE,
  google_sub TEXT UNIQUE,
  stripe_customer_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  created_at TEXT NOT NULL, last_seen_at TEXT, expires_at TEXT NOT NULL
);
CREATE TABLE entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,                -- monthly | yearly | lifetime
  status TEXT NOT NULL,              -- active | past_due | canceled | refunded
  source TEXT NOT NULL,              -- stripe | legacy | manual
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_id TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ent_user ON entitlements(user_id);
CREATE TABLE legacy_claims (legacy_uid TEXT PRIMARY KEY, user_id TEXT NOT NULL, claimed_at TEXT NOT NULL);
CREATE TABLE legacy_emails (email TEXT NOT NULL, legacy_uid TEXT NOT NULL, PRIMARY KEY(email, legacy_uid));
CREATE TABLE stripe_events (event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL);
CREATE TABLE usage_daily (
  user_id TEXT NOT NULL, day TEXT NOT NULL,           -- YYYY-MM-DD (UTC)
  delete_runs INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
```

## 8. 插件端改动

| 文件 | 改动 |
|---|---|
| `manifest.json` / `manifest.firefox.json` | 加 `storage`；保留 `identity` / `identity.email`；version → 7.0 |
| `background.js` | 新增 `AuthService`（Google flow、exchange、logout、token 存取）和 `EntitlementService`（`/me` 拉取 + 缓存）；`getUserInfo` 保留，作 `legacyUid` 来源，匿名 id 改存 `chrome.storage.local`（顺带修掉漂移） |
| `popup.html/css/js` | 按 UI 稿重做：**未登录只渲染登录页**；账号条、Pro 徽章、今日免费次数、定价页、账户页；Bulk Delete 点击时免费用户先调 `/usage/claim`，被拒则弹升级；`MembershipManager` → 读 background 的权益；去掉 🔒 emoji 改 SVG；`showModal` 保留做确认框 |
| `popup.js` `setOperationDelaySettings` | 注入对象增加 `plan`、`maxPerBatch`（free=10，Pro=Infinity） |
| `conversationHandler.js` | 删除/归档前按 `maxPerBatch` 截断已选列表，超出时回传 `limitReached` 给 popup 显示升级提示；Archive 在页面侧也校验 `plan !== 'free'`。Checkbox 类脚本也要求已登录（popup 侧拦截即可） |
| `bulkArchiveConversations.js` | 去掉单独的付费入口逻辑，统一走权益 |

## 9. Worker 改动

- 拆分 `src/index.ts`：`auth.ts`、`billing.ts`、`webhook.ts`、`entitlement.ts`、`legacy.ts`。
- 新 secrets：`STRIPE_SECRET_KEY`、`GOOGLE_CLIENT_ID`（Google Cloud Console 建 Web 类型 OAuth Client，回调填 `WORKER/auth/google/callback` —— **用户侧配置项**）、`GOOGLE_CLIENT_SECRET`、`SESSION_PEPPER`；vars：3 个 Price ID、允许的 redirect 前缀。
- 旧接口 `/check-payment-status`、`/pay-bulk-archive`、`/stripe-webhook` 旧分支 **保留至少 6 个月**；`/pay-bulk-archive` 在上线后改为返回"请升级插件"的提示链接，不再生成 $0.99 链接。
- CORS 收紧到插件 origin（`chrome-extension://<id>`、`moz-extension://*`）。

## 10. 上线顺序

1. 本地 + `env.dev`：建表、跑通 Google 登录、Stripe **test mode** 三种购买 + 取消 + 退款 + 续费失败。
2. **【需确认后执行】** prod D1 建新表（纯新增，可回滚 = DROP 新表）。
3. **【需确认后执行】** Stripe live 创建 Product/Prices/Portal、加 webhook 事件、配置 secrets。
4. **【需确认后执行】** 部署 Worker（新旧接口并存，老插件不受影响）。
5. **【需确认后执行】** 跑 legacy 邮箱回填（只读 Stripe + 写 `legacy_emails`）。
6. 更新隐私政策（新增收集邮箱）、CWS / AMO 数据使用声明。
7. **【需确认后执行】** 提交 v7.0 到 CWS / AMO。
8. **【需确认后执行】** 审核通过后停用旧 $0.99 Payment Link。

## 11. 测试清单

- 未登录：popup 只显示登录页，任何按钮都不可用。
- 免费：选 30 条点 Delete → 只删 10 条并出现升级提示；同一天再点 → 提示"今日免费次数已用完"；UTC 次日恢复；Archive 点击 → 打开定价页。
- 并发：两个 popup 同时点 Delete → 只有一个成功（`usage_daily` 原子 upsert + 条件判断）。
- Google 登录：Chrome、Edge、Firefox 各一次；浏览器未登录 Google、取消授权窗口、state 不匹配。
- Stripe test：月付、年付、买断 → popup 重开即为 Pro；Portal 取消 → 周期末降级；`invoice.payment_failed` → past_due 宽限；退款 → 降级。
- 订阅转买断：月付（任意第几期）→ 只付 $35.0；年付 → 只付 $20.0；用了优惠码导致当期实付更低 → 差价相应变大；past_due → 全价；转换后订阅被取消、不退款、计划显示 Lifetime。
- 老用户：用 dev 库造一条 `paid_users.is_paid=1` 的合成数据，分别走 A（legacyUid）、B（邮箱）、C（人工）三条路径 → Lifetime；同一 legacyUid 二次认领被拒。
- SW 被杀后重开 popup，登录态和权益仍在（`storage` 权限生效）。
- 老版本 v6.11 插件对新 Worker 仍能正常查状态。

## 12. 外部配置步骤

详见 [v7-setup-guide.md](./v7-setup-guide.md)（Stripe key / 价格 / 客户门户 / webhook，Google OAuth Client）。
