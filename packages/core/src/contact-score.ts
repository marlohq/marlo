import { and, contact as contactTable, db, eq } from '@workspace/core/drizzle.js';
import { contactIngestionQueue, type UpdateContactScoreJobData } from './contacts.ts';
import { PERSONAL_EMAIL_PROVIDERS } from './domains.ts';
import { logger as baseLogger } from './logger.js';

const logger = baseLogger.child({ namespace: 'contact-score' });

const SCALING_FACTOR = 400;

// Score decay configuration
export const DECAY_RATE = 0.98; // Keep 98% of score per day (2% decay)
export const MIN_SCORE_THRESHOLD = 0; // Don't decay scores below this value

function scoreDelta(rating: number, score: number, weight: number) {
	const expected = 1 / (1 + 10 ** (rating / SCALING_FACTOR));
	return weight * (score - expected);
}

const EVENTS = {
	OPEN: { score: 0.5, weight: 10 },
	MARKED_AS_READ: { score: 0.7, weight: 15 },
	REPLIED_TO: { score: 1.0, weight: 20 },
	MARKED_AS_SPAM: { score: -1.0, weight: 40 },
	UNMARKED_AS_SPAM: { score: 1.0, weight: 40 },
	SENT_SPAM: { score: -1.0, weight: 50 },
	LANDED_IN_PRIORITY: { score: 1.0, weight: 30 },
	INITIATED_WITH: { score: 1.0, weight: 30 },
	STAR: { score: 1.0, weight: 40 },
} satisfies Record<string, { score: number; weight: number }>;

export type ScoreEventType = keyof typeof EVENTS;

export function applyScoreEvents(
	accountId: string,
	contactEmail: string,
	events: ScoreEventType[],
) {
	return db.transaction(async (tx) => {
		const contacts = await tx
			.select()
			.from(contactTable)
			.where(and(eq(contactTable.accountId, accountId), eq(contactTable.email, contactEmail)));

		if (contacts.length === 0) {
			return;
		}

		for (const contact of contacts) {
			let totalDelta = 0;
			let currentScore = contact.score;

			// Calculate cumulative delta from all events
			for (const event of events) {
				logger.debug(
					{ accountId, contactEmail, event, currentScore },
					'Applying contact score event',
				);
				const { score, weight } = EVENTS[event];
				const delta = scoreDelta(currentScore, score, weight);
				totalDelta += delta;
				currentScore += delta;
			}

			const newScore = Math.round(contact.score + totalDelta);
			await tx
				.update(contactTable)
				.set({ score: newScore, scoreUpdatedAt: new Date() })
				.where(eq(contactTable.id, contact.id));
		}
	});
}

export function queueContactScoreUpdate(
	userId: string,
	accountId: string,
	contactEmail: string,
	events: ScoreEventType[],
) {
	return contactIngestionQueue.add('update-contact-score', {
		userId,
		accountId,
		email: contactEmail,
		events,
	} satisfies UpdateContactScoreJobData);
}

export function calculateScoreDecay(
	currentScore: number,
	scoreUpdatedAt: Date | null,
): { newScore: number; shouldUpdate: boolean } {
	const now = new Date();
	const lastUpdate = scoreUpdatedAt || now;
	const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

	// Skip if no time has passed or if it's the same day
	if (daysSinceUpdate <= 0 || currentScore <= MIN_SCORE_THRESHOLD) {
		return { newScore: currentScore, shouldUpdate: false };
	}

	// Calculate smooth decay based on actual time elapsed
	const decayFactor = DECAY_RATE ** daysSinceUpdate;
	const newScore = Math.max(MIN_SCORE_THRESHOLD, Math.round(currentScore * decayFactor));

	return {
		newScore,
		shouldUpdate: newScore !== currentScore,
	};
}

export function calculateInitialScoreBonus(accountEmail: string, contactEmail: string) {
	let bonus = 0;

	const accountDomain = accountEmail.split('@')[1]?.toLowerCase();
	const contactDomain = contactEmail.split('@')[1]?.toLowerCase();

	// Bonus if the domain is the same as account but isn't a common email provider
	if (
		accountDomain &&
		contactDomain &&
		accountDomain === contactDomain &&
		!PERSONAL_EMAIL_PROVIDERS.includes(accountDomain)
	) {
		bonus += 250;
	}

	return bonus;
}
