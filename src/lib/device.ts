import { DEVICE_COOKIE, DEVICE_STORAGE_KEY, isUuid } from './constants';

function writeCookie(id: string) {
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `${DEVICE_COOKIE}=${id}; Path=/; Max-Age=157680000; SameSite=Lax${secure}`;
}

/**
 * localStorage is the durable record of this device; the cookie lets the
 * server see it. Returns true when the cookie had to be corrected.
 */
export function syncDevice(serverId: string): boolean {
	if (!isUuid(serverId)) return false;
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(DEVICE_STORAGE_KEY);
	} catch {
		return false;
	}
	if (!isUuid(stored)) {
		localStorage.setItem(DEVICE_STORAGE_KEY, serverId);
		return false;
	}
	if (stored !== serverId) {
		writeCookie(stored);
		return true;
	}
	return false;
}

/** Adopts another device's mark, e.g. when moving into the installed app. */
export function adoptDevice(id: string): boolean {
	if (!isUuid(id)) return false;
	localStorage.setItem(DEVICE_STORAGE_KEY, id.toLowerCase());
	writeCookie(id.toLowerCase());
	return true;
}

const LAUNCHED_KEY = 'cc_launched';

/**
 * The installed app's start URL carries the mark of the browser it was added
 * from, and the page it was added on. Only its first launch may act on them;
 * later launches would otherwise undo a mark adopted by hand, or keep
 * returning to an old page.
 */
export function claimFirstLaunch(mark: string): { first: boolean; adopted: boolean } {
	try {
		if (localStorage.getItem(LAUNCHED_KEY)) return { first: false, adopted: false };
		localStorage.setItem(LAUNCHED_KEY, '1');
		if (localStorage.getItem(DEVICE_STORAGE_KEY) === mark.toLowerCase()) {
			return { first: true, adopted: false };
		}
	} catch {
		return { first: false, adopted: false };
	}
	return { first: true, adopted: adoptDevice(mark) };
}
