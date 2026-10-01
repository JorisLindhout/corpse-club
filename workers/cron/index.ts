// Companion Worker for scheduled jobs. Cloudflare Pages has no cron triggers,
// so this runs alongside the Pages app and shares its D1 database.
import { runReminders } from '../../src/lib/server/reminders';
import type { PushEnv } from '../../src/lib/server/notify';

export default {
	async scheduled(controller, env, ctx) {
		ctx.waitUntil(
			runReminders(env, controller.scheduledTime).then((report) =>
				console.log(`reminders: ${report.reminded} sent, ${report.expired} expired`)
			)
		);
	}
} satisfies ExportedHandler<PushEnv>;
