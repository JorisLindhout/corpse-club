export type PushSupport = 'supported' | 'ios-install' | 'unsupported';

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

/** iOS only delivers Web Push to apps added to the Home Screen. */
export function pushSupport(): PushSupport {
	if (isIOS() && !isStandalone()) return 'ios-install';
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

export async function existingSubscription(): Promise<PushSubscription | null> {
	if (pushSupport() !== 'supported' || Notification.permission !== 'granted') return null;
	const registration = await navigator.serviceWorker.getRegistration();
	return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Must be called from a user gesture. */
export async function subscribeToCorpse(corpseId: string, vapidPublicKey: string): Promise<void> {
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') throw new Error('denied');

	const registration = await navigator.serviceWorker.ready;
	const subscription =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToBytes(vapidPublicKey)
		}));

	const response = await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ corpseId, subscription: subscription.toJSON() })
	});
	if (!response.ok) throw new Error('subscribe failed');
}
