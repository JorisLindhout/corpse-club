/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />
import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL = `shell-${version}`;
const IMAGES = 'corpse-images';
const OFFLINE = '/offline';
// Launch screens and the share image are only fetched by iOS and link crawlers.
const ASSETS = [
	...build,
	...files.filter((file) => !file.startsWith('/splash/') && file !== '/og.png'),
	...prerendered
];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== SHELL && key !== IMAGES) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

/** Completed corpse images never change, so they are cached on first sight. */
function isCorpseImage(url: URL) {
	return /^\/api\/corpse\/[^/]+\/(image|section\/\d)$/.test(url.pathname);
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (ASSETS.includes(url.pathname) && url.pathname !== OFFLINE) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
		return;
	}

	if (isCorpseImage(url)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(IMAGES);
				const hit = await cache.match(request);
				if (hit) return hit;
				const response = await fetch(request);
				if (response.ok && response.headers.get('cache-control')?.includes('immutable')) {
					cache.put(request, response.clone());
				}
				return response;
			})()
		);
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => (await caches.match(OFFLINE)) ?? Response.error())
		);
	}
});

interface Summons {
	title: string;
	body: string;
	url: string;
	tag?: string;
}

sw.addEventListener('push', (event) => {
	let data: Summons = { title: 'Corpse Club', body: 'You have been summoned.', url: '/my-corpses' };
	try {
		data = { ...data, ...event.data?.json() };
	} catch {
		// Malformed payloads still deserve a notification.
	}
	event.waitUntil(
		sw.registration.showNotification(data.title, {
			body: data.body,
			icon: '/icons/icon-192.png',
			badge: '/icons/badge-96.png',
			tag: data.tag,
			data: { url: data.url }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = new URL(event.notification.data?.url ?? '/', sw.location.origin);
	if (target.origin !== sw.location.origin) return;

	event.waitUntil(
		(async () => {
			const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const existing =
				windows.find((w) => new URL(w.url).pathname === target.pathname) ?? windows[0];
			if (existing) {
				await existing.focus();
				if (new URL(existing.url).pathname !== target.pathname)
					await existing.navigate(target.href);
				return;
			}
			await sw.clients.openWindow(target.href);
		})()
	);
});
