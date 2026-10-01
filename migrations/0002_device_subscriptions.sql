-- Push subscriptions belong to a device, not a corpse: one "Summon me" covers
-- every corpse the device creates or draws in.

CREATE TABLE device_subscriptions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Newest first, so each endpoint keeps its latest device and keys.
INSERT OR IGNORE INTO device_subscriptions (id, device_id, endpoint, keys_p256dh, keys_auth, created_at)
SELECT id, device_id, endpoint, keys_p256dh, keys_auth, created_at
FROM push_subscriptions
WHERE device_id IS NOT NULL
ORDER BY created_at DESC;

DROP TABLE push_subscriptions;
ALTER TABLE device_subscriptions RENAME TO push_subscriptions;

CREATE INDEX idx_push_device ON push_subscriptions(device_id);
