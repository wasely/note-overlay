PRAGMA foreign_keys = ON;

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK(platform IN ('discord', 'telegram')),
  external_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX devices_platform_user ON devices(platform, external_user_id);

CREATE TABLE discord_pairings (
  id TEXT PRIMARY KEY,
  claim_hash TEXT NOT NULL,
  oauth_state_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'ready', 'failed')),
  device_id TEXT,
  discord_user_id TEXT,
  error_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id)
);

CREATE TABLE telegram_claims (
  id TEXT PRIMARY KEY,
  claim_hash TEXT NOT NULL,
  requested_username TEXT NOT NULL COLLATE NOCASE,
  local_bot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon_json TEXT NOT NULL DEFAULT '{}',
  permissions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('pending', 'ready', 'failed')),
  device_id TEXT,
  expected_user_id TEXT,
  telegram_user_id TEXT,
  external_bot_id TEXT,
  bot_username TEXT,
  display_name TEXT,
  error_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id)
);
CREATE UNIQUE INDEX telegram_claims_pending_username ON telegram_claims(requested_username) WHERE status = 'pending';

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  local_bot_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('discord', 'telegram')),
  owner_external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon_json TEXT NOT NULL DEFAULT '{}',
  permissions_json TEXT NOT NULL DEFAULT '[]',
  external_bot_id TEXT,
  username TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE(device_id, local_bot_id, platform)
);
CREATE INDEX agents_owner_platform ON agents(owner_external_id, platform, updated_at DESC);
