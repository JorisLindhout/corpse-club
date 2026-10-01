/// <reference path="./sveltekit-worker.d.ts" />
// Worker entry: SvelteKit serves requests; the hourly cron chases late hands.
import app from 'sveltekit-worker';
import { runReminders } from '../src/lib/server/reminders';

export default {
	fetch: app.fetch!,
	async scheduled(controller, env, ctx) {
		ctx.waitUntil(
			runReminders(env, controller.scheduledTime).then((report) =>
				console.log(`reminders: ${report.reminded} sent, ${report.expired} expired`)
			)
		);
	}
} satisfies ExportedHandler<Env>;
