import { describe, expect, it } from 'vitest';
import { iosBrowser, iosSupportsPush, isInAppBrowser } from './push';
import { isResumePath } from './constants';

const SAFARI_17 =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const SAFARI_16_3 =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const CHROME_IOS =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.71 Mobile/15E148 Safari/604.1';
const FIREFOX_IOS =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15';
const IPAD_DESKTOP =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const INSTAGRAM =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0';

describe('iOS install guidance', () => {
	it('names the browser to explain', () => {
		expect(iosBrowser(SAFARI_17)).toBe('safari');
		expect(iosBrowser(CHROME_IOS)).toBe('chrome');
		expect(iosBrowser(FIREFOX_IOS)).toBe('firefox');
		expect(iosBrowser(INSTAGRAM)).toBe('other');
	});

	it('requires iOS 16.4 for Web Push', () => {
		expect(iosSupportsPush(SAFARI_17)).toBe(true);
		expect(iosSupportsPush(SAFARI_16_3)).toBe(false);
		expect(iosSupportsPush(CHROME_IOS)).toBe(true);
		expect(iosSupportsPush(IPAD_DESKTOP)).toBe(true);
	});

	it('spots embedded app browsers', () => {
		expect(isInAppBrowser(INSTAGRAM)).toBe(true);
		expect(isInAppBrowser(SAFARI_17)).toBe(false);
		expect(isInAppBrowser(CHROME_IOS)).toBe(false);
	});
});

describe('isResumePath', () => {
	const id = '0b7c3f0e-8a5e-4c6f-9d1a-2b3c4d5e6f70';

	it('accepts the pages an installed app may reopen', () => {
		expect(isResumePath(`/draw/${id}`)).toBe(true);
		expect(isResumePath('/draw/new')).toBe(true);
		expect(isResumePath(`/c/${id}`)).toBe(true);
		expect(isResumePath(`/c/${id}/status`)).toBe(true);
	});

	it('rejects anything else', () => {
		expect(isResumePath('/my-corpses')).toBe(false);
		expect(isResumePath(`//evil.example/draw/${id}`)).toBe(false);
		expect(isResumePath(`/draw/${id}?x=1`)).toBe(false);
		expect(isResumePath(null)).toBe(false);
	});
});
