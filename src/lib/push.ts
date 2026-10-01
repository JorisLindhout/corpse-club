export type PushSupport = 'supported' | 'ios-install' | 'in-app' | 'unsupported';
export type IosBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'other';

// Embedded browsers of social apps: no Add to Home Screen, no Web Push.
const IN_APP =
	/FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|musical_ly|BytedanceWebview|TikTok|\bLine\/|GSA\//;

export function isIOS(): boolean {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
}

export function isStandalone(): boolean {
	return (
		matchMedia('(display-mode: standalone)').matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

export function isInAppBrowser(ua: string): boolean {
	return IN_APP.test(ua);
}

export function iosBrowser(ua: string): IosBrowser {
	if (/CriOS\//.test(ua)) return 'chrome';
	if (/EdgiOS\//.test(ua)) return 'edge';
	if (/FxiOS\//.test(ua)) return 'firefox';
	if (/OPiOS\/|OPT\/|Ddg\//.test(ua)) return 'other';
	return /Safari\//.test(ua) ? 'safari' : 'other';
}

/** Home Screen web apps get Web Push from iOS 16.4. Unknown versions get the benefit of the doubt. */
export function iosSupportsPush(ua: string): boolean {
	// iPads ask for desktop sites and report a macOS version, but keep Safari's.
	const match = /iP(?:hone|ad|od).* OS (\d+)_(\d+)/.exec(ua) ?? /Version\/(\d+)\.(\d+)/.exec(ua);
	if (!match) return true;
	return Number(match[1]) * 100 + Number(match[2]) >= 1604;
}

/** iOS only delivers Web Push to apps added to the Home Screen. */
export function pushSupport(): PushSupport {
	const ua = navigator.userAgent;
	if (isInAppBrowser(ua)) return 'in-app';
	if (isIOS() && !isStandalone()) return iosSupportsPush(ua) ? 'ios-install' : 'unsupported';
	if (
		!('serviceWorker' in navigator) ||
		!('PushManager' in window) ||
		!('Notification' in window)
	) {
		return 'unsupported';
	}
	return 'supported';
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
	const raw = atob(base64);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

async function existingSubscription(): Promise<PushSubscription | null> {
	if (pushSupport() !== 'supported' || Notification.permission !== 'granted') return null;
	const registration = await navigator.serviceWorker.getRegistration();
	return (await registration?.pushManager.getSubscription()) ?? null;
}

async function register(subscription: PushSubscription): Promise<void> {
	const response = await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ subscription: subscription.toJSON() })
	});
	if (!response.ok) throw new Error('subscribe failed');
}

/**
 * Ties this browser's existing subscription to the current mark, e.g. after a
 * mark was adopted. Returns false when there is nothing to tie.
 */
export async function refreshSubscription(): Promise<boolean> {
	const subscription = await existingSubscription();
	if (!subscription) return false;
	await register(subscription);
	return true;
}

/** Must be called from a user gesture. */
export async function subscribeDevice(vapidPublicKey: string): Promise<void> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') throw new Error('denied');

	const registration = await navigator.serviceWorker.ready;
	const subscription =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToBytes(vapidPublicKey)
		}));
	await register(subscription);
}
