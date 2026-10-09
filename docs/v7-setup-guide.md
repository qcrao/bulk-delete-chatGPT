# v7 外部配置手册（Stripe + Google 登录）

> 原则：**先在 Stripe Test mode + Worker `env.dev` 全部跑通，再在 Live 重做一遍**。下面每一步 Test / Live 都要各做一次（Stripe 的 test 和 live 数据完全隔离，ID 也不同）。
> 所有 key 只放进 Worker secrets，不进代码、不进插件、不发到聊天里。

---

## A. Stripe

### A1. 需要的 key 一览

| 名称（Worker 里的变量名） | 形如 | 用途 | 放哪 |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `rk_test_…` / `rk_live_…` | Worker 调 Stripe API：建 Checkout、查发票、取消订阅、开客户门户 | `wrangler secret` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | 校验 webhook 签名（**已有**，继续用） | `wrangler secret` |
| `STRIPE_PRODUCT_ID` | `prod_…` | 订阅转买断时按差价动态建价格 | `wrangler.toml` vars |
| `STRIPE_PRICE_MONTHLY` | `price_…` | $4.9 / 月 | `wrangler.toml` vars |
| `STRIPE_PRICE_YEARLY` | `price_…` | $19.9 / 年 | `wrangler.toml` vars |
| `STRIPE_PRICE_LIFETIME` | `price_…` | $39.9 一次性 | `wrangler.toml` vars |

不需要 Publishable key（`pk_…`）：结账页由 Stripe 托管，插件不直接接触 Stripe。

> 现状提醒：现在的 `src/index.ts` 是 `new Stripe(c.env.STRIPE_WEBHOOK_SECRET)`，把 webhook 密钥当成了 API key。这样只能验签，调不了接口。v7 改成 `new Stripe(c.env.STRIPE_SECRET_KEY)`，验签时仍用 `STRIPE_WEBHOOK_SECRET`。

### A2. 建商品和 3 个价格
1. Stripe Dashboard 右上角切到 **Test mode**。
2. **Product catalog → + Add product**
   - Name：`ChatGPT Bulk Delete Pro`
   - Description：`Unlimited bulk delete & archive for ChatGPT, no ads.`
   - 第一个价格：**Recurring**，`$4.90`，**Monthly** → 保存。
3. 进入这个 Product 页面 → **+ Add another price**：
   - **Recurring**，`$19.90`，**Yearly**
   - **One-off**，`$39.90`
4. 记下 Product ID（`prod_…`）和 3 个 Price ID（`price_…`，在每个价格的详情页右上角复制）。
5. 建议给每个 Price 填 **Lookup key**：`pro_monthly` / `pro_yearly` / `pro_lifetime`（以后换价格不用改代码）。

### A3. 创建受限 API Key（推荐，比完整 Secret key 安全）
**Developers → API keys → + Create restricted key**，名称 `bulk-delete-worker`，权限：

| 资源 | 权限 |
|---|---|
| Checkout Sessions | Write |
| Customers | Write |
| Subscriptions | Write（转买断时取消订阅） |
| Invoices | Read（计算累计实付） |
| Charges / Refunds | Read |
| Products, Prices | Write（差价用 `price_data` 动态建价格） |
| Customer portal（Billing portal） | Write |
| 其他 | None |

创建后复制 `rk_test_…`（只显示一次）。

### A4. 客户门户（用户自己取消 / 换卡 / 看发票）
**Settings → Billing → Customer portal**：
- ✅ Invoice history
- ✅ Update payment methods
- ✅ Cancel subscriptions → **At end of billing period**（到期再降级）；可开启取消原因调查
- Subscriptions → Switch plans：允许在 Monthly ↔ Yearly 之间切换（**不要**把 Lifetime 放进来，转买断走我们自己的差价流程）
- Business information：填隐私政策和服务条款链接
- 点 **Save**。

### A5. Webhook
**Developers → Webhooks**，找到现有的 endpoint `https://bulk-delete-chatgpt-worker.qcrao.com/stripe-webhook`（Test 模式下另建一个指向 `https://dev.bulk-delete-chatgpt-worker.qcrao.com/stripe-webhook`），**Add events**：

- `checkout.session.completed`（已有）
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.refunded`

Test 模式的新 endpoint 会生成新的 `whsec_…`，作为 dev 环境的 `STRIPE_WEBHOOK_SECRET`。

### A6. 其他 Stripe 设置
- **Settings → Payments → Payment methods**：至少开 Card；可以加 Apple Pay / Google Pay / Link。
- **Settings → Customer emails**：开启 "Successful payments" 和 "Refunds"，订阅类开启 "Upcoming renewals"（年付续费前提醒能减少拒付）。
- **Settings → Subscriptions and emails → Manage failed payments**：Smart Retries 开启，全部重试失败后 → **Cancel the subscription**。
- 税务：卖给全球个人用户，建议评估开启 **Stripe Tax**（会按地区额外加税或从价内扣，影响到手金额）——这条需要你决定。

### A7. 写进 Worker
```bash
cd ~/bulk-delete-chatgpt-worker
# dev（test 模式的值）
npx wrangler secret put STRIPE_SECRET_KEY --env dev      # 粘贴 rk_test_…
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env dev  # 粘贴 test 的 whsec_…
```
`wrangler.toml`：
```toml
[env.dev.vars]
STRIPE_PRODUCT_ID     = "prod_…"
STRIPE_PRICE_MONTHLY  = "price_…"
STRIPE_PRICE_YEARLY   = "price_…"
STRIPE_PRICE_LIFETIME = "price_…"
```
Live 同理写到 `--env prod` / `[env.prod.vars]` —— **这一步写生产，执行前单独确认**。

---

## B. Google 登录（OAuth）

流程：插件 `launchWebAuthFlow` → Worker `/auth/google/start` → Google → Worker `/auth/google/callback` → 回到插件的 `https://<id>.chromiumapp.org/`。
所以 **Google Console 里只登记 Worker 的回调地址**；插件的回跳地址由 Worker 自己做白名单校验。

### B1. 建项目
1. 打开 <https://console.cloud.google.com/>，顶部项目选择器 → **New project**，名称 `Bulk Delete for ChatGPT` → Create，切到该项目。

### B2. 配置 OAuth 同意屏幕（Google Auth Platform）
左侧菜单 **APIs & Services → OAuth consent screen**（新版叫 **Google Auth Platform**），点 **Get started**：
1. **App information**：App name `Bulk Delete for ChatGPT`；User support email 选你的邮箱。
   - 名称里**不要**写 "ChatGPT" 开头或暗示官方（Google 审核会拒绝看起来冒充别家品牌的应用名），推荐用现在的写法。
2. **Audience**：选 **External**。
3. **Contact information**：填开发者邮箱。
4. 同意政策 → **Create**。
5. 进入 **Branding**：
   - App home page：插件官网或 Chrome Web Store 链接
   - Privacy policy：`https://…/privacy`（**必须先上线，并写明收集邮箱**）
   - Terms of service：可选
   - Authorized domains：`qcrao.com`
   - App logo：**先不传**。传了 logo 就要走品牌验证（几天）；不传只用基础 scope，可以直接上线。
6. **Data access → Add or remove scopes**：只勾 `openid`、`.../auth/userinfo.email`、`.../auth/userinfo.profile`。三个都是非敏感 scope，**不需要 Google 安全审核**。
7. **Audience → Publish app → 切到 In production**。
   - 不切的话停留在 Testing：只有手动加的 test users（最多 100 个）能登录，而且授权 7 天就过期。dev 联调阶段可以先用 Testing 并把自己加为 test user。

### B3. 创建 OAuth Client
**Clients（或 Credentials）→ + Create client**：
- Application type：**Web application**（不是 "Chrome extension"——那种只配合 `chrome.identity.getAuthToken`，Firefox 和 Edge 都用不了）
- Name：`bulk-delete-worker`
- Authorized JavaScript origins：留空
- **Authorized redirect URIs**：
  - `https://bulk-delete-chatgpt-worker.qcrao.com/auth/google/callback`
  - `https://dev.bulk-delete-chatgpt-worker.qcrao.com/auth/google/callback`
- Create → 复制 **Client ID**（`….apps.googleusercontent.com`）和 **Client secret**（`GOCSPX-…`）。

### B4. 写进 Worker
```bash
npx wrangler secret put GOOGLE_CLIENT_ID --env dev
npx wrangler secret put GOOGLE_CLIENT_SECRET --env dev
npx wrangler secret put SESSION_PEPPER --env dev   # 随机 32 字节：openssl rand -hex 32
```
`wrangler.toml` 加插件回跳白名单：
```toml
[env.dev.vars]
ALLOWED_EXT_REDIRECTS = "https://effkgioceefcfaegehhfafjneeiabdjg.chromiumapp.org/,https://<本地未打包插件ID>.chromiumapp.org/,https://<firefox-hash>.extensions.allizom.org/,https://<edge-store-ID>.chromiumapp.org/"
```
各个 ID 怎么拿：
- **Chrome 正式版**：`effkgioceefcfaegehhfafjneeiabdjg`（商店 ID，已知）。
- **本地未打包开发版**：`chrome://extensions` 卡片上的 ID。为了固定，可以从 Developer Dashboard 的 **Package → Public key** 复制，加到开发用 manifest 的 `"key"` 字段，这样本地 ID 就和商店一致。
- **Firefox**：装上插件后，在 `about:debugging` → 插件 → Inspect 的控制台执行 `browser.identity.getRedirectURL()`，结果就是要填的地址（由 gecko id `BulkDeleteChatGPT-qrcao@github.com` 推导，固定不变）。
- **Edge**：如果在 Edge Add-ons 单独上架，会有另一个 ID，同样执行 `chrome.identity.getRedirectURL()` 获取。用户在 Edge 上直接装 Chrome 商店版的话，ID 和 Chrome 一样。

### B5. Cloudflare Access 别拦新接口
现在 Zero Trust Access 拦了 `/update-payment-status`。在 Cloudflare Zero Trust → Access → Applications 里确认该 application 的路径**只覆盖**管理类接口，**不要**覆盖 `/auth/*`、`/billing/*`、`/usage/*`、`/me`、`/stripe-webhook`，否则 Google 回调和 Stripe webhook 都会被 401。

### B6. 插件 manifest
- `permissions` 增加 `storage`；保留 `identity`、`identity.email`。
- `host_permissions` 不变（Worker 域名已经在里面）。
- Firefox `data_collection_permissions.required` 核对是否需要加 `authenticationInfo`。

---

## C. 自测顺序（dev + test mode）
1. `chrome://extensions` 加载本地版 → 打开 popup → 只看到登录页 → Continue with Google → 回到 popup，显示免费版和"今日剩 1 次"。
2. 用 Stripe 测试卡 `4242 4242 4242 4242`（任意未来日期 / CVC）分别买月付、年付、买断。
3. 测试卡 `4000 0000 0000 0341`（绑卡成功但扣款失败）→ 用 **Test clocks** 把订阅推到续费日 → 验证 past_due 宽限期和最终降级。
4. 月付用户点 Go Lifetime → 结账页金额应为 $35.00；年付用户应为 $20.00。
5. Dashboard 退款 → 计划降回 Free。
