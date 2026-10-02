export const SECTION_COUNT = 3;

/** Every section is normalised to this size before upload. */
export const SECTION_WIDTH = 1000;
export const SECTION_HEIGHT = 750;

/** Bottom strip of each section revealed to the next acolyte. */
export const OVERLAP_HEIGHT = 60;

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_NAME_LENGTH = 40;

export const SECTION_LABELS = ['The head', 'The torso', 'The legs'] as const;
export const ROMAN = ['I', 'II', 'III'] as const;

export const DEVICE_COOKIE = 'cc_device';
export const DEVICE_STORAGE_KEY = 'cc_device';

export const HOUR = 60 * 60 * 1000;
export const FIRST_REMINDER_AFTER = 48 * HOUR;
export const NEXT_REMINDER_AFTER = 24 * HOUR;

/** Draw page slug for the head of a corpse that is summoned but not yet sealed. */
export const NEW_CORPSE = 'new';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const RESUME_RE = new RegExp(`^/(draw/(${UUID}|${NEW_CORPSE})|c/${UUID}(/status)?)$`, 'i');

export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_RE.test(value);
}

/** Pages an installed app may open on its first launch, where it was added from. */
export function isResumePath(value: unknown): value is string {
	return typeof value === 'string' && RESUME_RE.test(value);
}
