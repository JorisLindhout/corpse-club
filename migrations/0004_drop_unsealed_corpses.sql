-- Corpses are now created when their head is sealed. Drop the ones summoned
-- under the old flow whose head was never drawn: they hold no images. The
-- set of sealed heads is untouched by these deletes, so each one sees the
-- same corpses.

DELETE FROM hidden_corpses
WHERE corpse_id NOT IN (SELECT corpse_id FROM sections WHERE position = 1 AND status = 'complete');

DELETE FROM sections
WHERE corpse_id NOT IN (SELECT corpse_id FROM sections WHERE position = 1 AND status = 'complete');

DELETE FROM corpses
WHERE id NOT IN (SELECT corpse_id FROM sections WHERE position = 1 AND status = 'complete');
