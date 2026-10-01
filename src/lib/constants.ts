export const SECTION_COUNT = 3;

/** Every section is normalised to this size before upload. */
export const SECTION_WIDTH = 1000;
export const SECTION_HEIGHT = 750;

/** Bottom strip of each section revealed to the next hand. */
export const OVERLAP_HEIGHT = 60;

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_NAME_LENGTH = 40;

export const SECTION_LABELS = ['The Head', 'The Torso', 'The Legs'] as const;
export const ROMAN = ['I', 'II', 'III'] as const;

export const DEVICE_COOKIE = 'cc_device';
export const DEVICE_STORAGE_KEY = 'cc_device';

export const HOUR = 60 * 60 * 1000;
export const FIRST_REMINDER_AFTER = 48 * HOUR;
export const NEXT_REMINDER_AFTER = 24 * HOUR;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_RE.test(value);
}
