# One-click bot creation: supported platform paths

Checked 2026-08-19. Primary sources only.

## Decision

There are two honest products:

1. **Distinct bot identities:** Telegram can deliver one-time account authorization, then name-only creation through Managed Bots. This needs an MTProto user session in Notebook **and a hosted manager-bot token broker**.
2. **Discord support:** install one Notebook-owned Discord app once, then create named logical agents/workflows locally. They all use the same Discord app/bot identity. Discord does not expose a supported way for a user OAuth login to create applications/bot users or obtain bot tokens.

Do not promise name-only creation of distinct Discord bots.

## Discord

### What OAuth can and cannot do

- A Discord bot is a separate bot user backed by an application. Discord's setup still starts by creating the application in Developer Portal; the bot token is generated there and is not a user's OAuth token ([bot overview](https://docs.discord.com/developers/bots/overview), [OAuth2 and permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions), [quick start](https://docs.discord.com/developers/quick-start/getting-started)).
- The complete relevant OAuth scope list includes `identify`, `guilds`, `bot`, `applications.commands`, `applications.commands.update`, `applications.commands.permissions.update`, `applications.builds.read`, `applications.builds.upload`, `applications.entitlements`, and `applications.store.update`. None grants application creation, bot-user creation, bot-token retrieval, or bot-token reset. `bot` installs the existing application's bot; it does not create one ([OAuth2 scope reference](https://docs.discord.com/developers/topics/oauth2#shared-resources-oauth2-scopes)).
- The documented OAuth endpoints authorize, issue, and revoke OAuth tokens. `GET /oauth2/applications/@me` only returns the application associated with the current authorization. The Application resource exposes **Get Current Application** and **Edit Current Application**, both for the requesting bot's existing application; it exposes no Create Application endpoint ([OAuth2](https://docs.discord.com/developers/topics/oauth2), [Application resource](https://docs.discord.com/developers/resources/application)). Therefore the absence of an app/bot creation API is an inference from Discord's complete official OAuth and Application references, reinforced by Discord's portal-only setup instructions.
- A bot token cannot be read again. The owner must reset it in Developer Portal (possibly confirming with 2FA), which invalidates the old token ([Discord token-reset guidance](https://support-dev.discord.com/hc/en-us/articles/6470840524311-Why-can-t-I-copy-my-bot-s-token)).
- Using a normal user's login/token or private Developer Portal calls is not a legitimate workaround. Discord forbids automating normal user accounts outside OAuth2/bot APIs, and its policy forbids soliciting user passwords or login tokens ([self-bot policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots), [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)).

### Supported one-install design

Create one Notebook-owned Discord application:

- **User install:** `applications.commands`; available to that user across their servers, DMs, and group DMs, while respecting the user's permissions.
- **Guild install:** `applications.commands bot`; a member with `MANAGE_GUILD` approves the installation and requested bot permissions.

After that one install, `name -> create workflow` can be instant. Store logical agents by Discord user/guild and expose them through a command option, autocomplete, buttons, or threads. The app can render the logical name/avatar in its response content, but every workflow remains the same Discord application/bot identity ([installation contexts and links](https://docs.discord.com/developers/resources/application#installation-context), [application commands](https://docs.discord.com/developers/interactions/application-commands)).

### Token boundary

Discord says bot tokens are password-equivalent, must never be exposed publicly, and must not be committed to source control ([OAuth2 and permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions), [quick start](https://docs.discord.com/developers/quick-start/getting-started)). Shipping a shared Notebook bot token in an Electron binary or downloading it to every desktop would expose one global credential to untrusted clients; local encryption does not fix extraction while the app is running. A shared Discord app therefore requires a backend/worker that retains the token and handles Gateway/API traffic. Local encrypted storage remains reasonable only for a user-owned token that the user manually obtained, which preserves the unwanted Developer Portal step.

## Telegram

### Exact name-only route

Telegram officially permits an authorized **user** to create a managed bot without @BotFather by calling `bots.createBot(name, username, manager_id)`. The manager must be a bot whose `bot_can_manage_bots` flag is enabled through **Bot Management Mode**. Only users may call `bots.createBot`; the manager bot receives the creation update and can export the new bot token ([Managed Bots](https://core.telegram.org/api/bots/managed-bots), [`bots.createBot`](https://core.telegram.org/method/bots.createBot), [Bot Management Mode walkthrough](https://core.telegram.org/bots/features#managed-bots)).

Implementation:

1. The Notebook publisher registers its own Telegram application and supplies its `api_id`/`api_hash`; each end user does not register an app. Telegram requires every third-party client product to use its own API ID and comply with the API Terms ([obtaining an API ID](https://core.telegram.org/api/obtaining_api_id), [API Terms](https://core.telegram.org/api/terms)).
2. User authorizes Notebook once through MTProto/TDLib. QR login is the shortest route; phone/code login may require SRP 2FA and third-party clients cannot rely on SMS being available ([QR login](https://core.telegram.org/api/qr-login), [user authorization](https://core.telegram.org/api/auth), [2FA/SRP](https://core.telegram.org/api/srp)). OIDC/Telegram Login authenticates a web identity only; it does not provide the MTProto user authorization required by the user-only `bots.createBot` method ([Telegram Login](https://core.telegram.org/bots/telegram-login)).
3. Persist the authorized session, not the 2FA password. Telegram binds authorization to the client's `auth_key_id`; TDLib stores its database in a persistent local directory and supports a database encryption key ([authorization persistence](https://core.telegram.org/api/auth#we-are-authorized), [TDLib setup](https://core.telegram.org/tdlib/getting-started), [TDLib database encryption](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1set_database_encryption_key.html)). Protect the database key with the operating system secret store.
4. On name entry, derive a globally unique username ending in `bot`, check/retry it with `bots.checkUsername`, then call `bots.createBot`. Names are 1–64 characters; usernames are 5–32 characters, use letters/digits/underscore, must end in `bot`, may collide, and account creation limits still apply ([Managed Bots](https://core.telegram.org/api/bots/managed-bots), [`bots.createBot` errors](https://core.telegram.org/method/bots.createBot)). This automation is what lets the UI request only a display name.
5. The manager receives the managed-bot update and calls Bot API `getManagedBotToken(user_id)`; `replaceManagedBotToken` rotates it ([Bot API: `getManagedBotToken`](https://core.telegram.org/bots/api#getmanagedbottoken), [Bot API: `replaceManagedBotToken`](https://core.telegram.org/bots/api#replacemanagedbottoken)). Deliver the per-bot token to Notebook over an authenticated encrypted channel and store it with the existing OS-backed secret storage.

The manager bot's token controls token export and is itself a powerful bot credential. For a zero-setup desktop distribution, it must stay in a hosted broker; do not bundle it into Electron. A fully local alternative requires the user to create/configure their own manager bot once and enter its token, so it fails the requested “login and no other steps” onboarding.

### Lower-complexity deep-link route

Notebook can generate:

```text
https://t.me/newbot/<manager_username>/<suggested_username>?name=<display_name>
```

Telegram opens a native window with name/username prefilled; the user must confirm each bot. The manager then receives the same update and exports the token. This removes BotFather and token copying but is **not** name-only because every creation has an external confirmation ([managed-bot creation links](https://core.telegram.org/api/links#managed-bot-creation-request-links), [walkthrough](https://core.telegram.org/bots/features#managed-bots)).

## Feasible architectures, ranked

| Rank | Architecture | Truly login once, then name only? | Distinct platform identities? | Main cost |
|---:|---|---|---|---|
| 1 | Telegram MTProto/TDLib + Notebook manager-bot broker | **Yes** | **Yes** | MTProto client, secure hosted broker, username/limit handling |
| 2 | One shared Discord app + named logical workflows | **Yes, after one app install** | No; one shared Discord identity | Hosted bot/interaction worker; product must call them agents/workflows |
| 3 | Telegram managed-bot deep link + broker | No; one Telegram confirmation per bot | **Yes** | External confirmation, but much simpler and no MTProto user session |
| 4 | User-owned Telegram manager + local MTProto | Only after extra one-time BotFather/manager/token setup | **Yes** | Not zero-setup, but can remain local after setup |
| 5 | Per-bot Discord Developer Portal setup | No | **Yes** | Application creation, reset/copy token, install per bot |

Recommended product split: ship shared-identity Discord “agents” and true distinct Telegram managed bots. If no hosted service is acceptable, honest one-time-login/name-only creation is unavailable: keep the current user-supplied-token flow or accept one-time manager-bot setup for Telegram.
