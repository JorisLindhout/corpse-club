-- Corpse Club initial schema

CREATE TABLE corpses (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'complete' | 'expired'
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  creator_device_id TEXT
);

CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  corpse_id TEXT NOT NULL REFERENCES corpses(id),
  position INTEGER NOT NULL, -- 1, 2, or 3
  invite_token TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'drawing' | 'complete'
  image_key TEXT, -- R2 object key
  contributor_name TEXT,
  device_id TEXT,
  completed_at INTEGER,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_at INTEGER,
  -- When the section became drawable (corpse creation for section 1,
  -- completion of the previous section otherwise). Drives reminder timing.
  activated_at INTEGER
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  corpse_id TEXT NOT NULL REFERENCES corpses(id),
  device_id TEXT,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Fixed-window rate limiting counters for write endpoints.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_sections_corpse_position ON sections(corpse_id, position);
CREATE INDEX idx_sections_device ON sections(device_id);
CREATE INDEX idx_sections_active ON sections(status, activated_at);
CREATE INDEX idx_corpses_creator ON corpses(creator_device_id);
CREATE UNIQUE INDEX idx_push_corpse_endpoint ON push_subscriptions(corpse_id, endpoint);
