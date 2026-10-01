-- Removing a corpse from a collection only hides it for that device: the
-- other hands keep their copy.

CREATE TABLE hidden_corpses (
  device_id TEXT NOT NULL,
  corpse_id TEXT NOT NULL REFERENCES corpses(id),
  hidden_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, corpse_id)
);
