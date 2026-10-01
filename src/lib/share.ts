export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Native share sheet where available, clipboard otherwise. */
export async function shareLink(data: {
	url: string;
	title?: string;
	text?: string;
}): Promise<ShareOutcome> {
	if (navigator.share) {
		try {
			await navigator.share(data);
			return 'shared';
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
		}
	}
	try {
		await navigator.clipboard.writeText(data.url);
		return 'copied';
	} catch {
		return 'failed';
	}
}
