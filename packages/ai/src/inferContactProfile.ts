import type { ContactProfile } from '@workspace/core/contacts.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import type { MailReport } from '@workspace/core/types.js';
import { generateObject } from 'ai';
import { z } from 'zod';
import { MODELS } from './util.ts';

const logger = baseLogger.child({ namespace: 'ai:contact-profile' });

const ContactProfileSchema = z.object({
	title: z.string().optional(),
	company: z.string().optional(),
	location: z.string().optional(),
	phone_number: z.string().optional(),
	website: z.string().optional(),
	socialMedia: z
		.array(
			z.object({
				platform: z.string(),
				url: z.string(),
			}),
		)
		.optional(),
});

type InferredContactProfile = z.infer<typeof ContactProfileSchema>;

function mergeSocialMedia(
	existing: { platform: string; url: string }[] = [],
	inferred: { platform: string; url: string }[] = [],
): { platform: string; url: string }[] {
	const combined = [...existing, ...inferred];
	const seen = new Set<string>();
	return combined.filter((item) => {
		if (seen.has(item.platform)) return false;
		seen.add(item.platform);
		return true;
	});
}

function formatMailReportsForPrompt(mailReports: MailReport[]): string {
	return mailReports
		.map((report, index) => {
			return `## Email Report ${index + 1}

${report}
`;
		})
		.join('\n\n');
}

export async function inferContactProfile({
	contactEmail,
	contactName,
	recentMailReports,
	existingProfile,
}: {
	contactEmail: string;
	contactName?: string | null;
	recentMailReports: MailReport[];
	existingProfile?: ContactProfile | null;
}): Promise<ContactProfile> {
	try {
		logger.debug(
			{ contactEmail, reportCount: recentMailReports.length },
			'Starting contact profile inference',
		);

		if (recentMailReports.length === 0) {
			logger.debug({ contactEmail }, 'No mail reports available for profile inference');
			return existingProfile || {};
		}

		const reportsText = formatMailReportsForPrompt(recentMailReports);
		const contactIdentifier = contactName ? `${contactName} (${contactEmail})` : contactEmail;

		const systemPrompt = `You are a professional at analyzing email reports to infer professional profile information about a contact.

**IMPORTANT RULES:**
1. Only infer information that can be confidently determined from the contact identifier, email content and signature
2. Be extremely conservative - if you're not confident, omit that field entirely
3. Focus on professional information: company, job title, location, phone number, website, social media profiles
4. For phone numbers, only extract if clearly visible (e.g., in signatures or explicit mentions like "Call me at...")
5. For websites, only include if explicitly presented as the person's own website (e.g., in signatures, "visit my site", "my portfolio")
6. For emails from services and companies, focus on the human sender's info if it exists, otherwise use the company's info if relevant
7. Avoid inferring sender details from automated emails about the recipient's activities (e.g., "You signed in from Stockholm" tells us about the recipient, not the sender)
8. Ignore calendar invites, meeting notifications, and similar automated emails
9. Do not include any fields that cannot be determined from the emails`;

		const userPrompt = `**Contact:** ${contactIdentifier}

**Recent Email Reports:**
${reportsText}

Extract professional profile information for ${contactIdentifier} from these email reports. Look specifically for:

- **Company:** Employer name (from signatures, mentions, company email domains)
- **Title:** Job title or role (from signatures, self-descriptions, ex: "Software Engineer", "CTO", "Founder")
- **Location:** Work or general location (from signatures, content)
- **Phone Number:** Contact numbers (from signatures, explicit mentions)
- **Website:** Personal or professional URLs
- **Social Media:** Mentioned profiles (LinkedIn, Twitter, etc.)`;

		const result = await generateObject({
			model: MODELS['gemini-2.0-flash'],
			system: systemPrompt,
			prompt: userPrompt,
			schema: ContactProfileSchema,
			temperature: 0.1, // Low temperature for consistent, conservative inference
		});

		const inferredProfile = result.object;

		logger.debug({ contactEmail, inferredProfile }, 'Profile inferred from mail reports');

		// Merge profiles: existing values take precedence over inferred ones
		const mergedProfile: ContactProfile = {
			...inferredProfile,
			...Object.fromEntries(
				Object.entries(existingProfile || {}).filter(([_, value]) => value !== undefined),
			),
			socialMedia: mergeSocialMedia(existingProfile?.socialMedia, inferredProfile.socialMedia),
		};

		logger.debug(
			{
				contactEmail,
				inferredFields: Object.keys(inferredProfile).filter(
					(key) => inferredProfile[key as keyof typeof inferredProfile],
				),
			},
			'Contact profile inference completed',
		);

		return mergedProfile;
	} catch (error) {
		logger.error(
			{ error, contactEmail, reportCount: recentMailReports.length },
			'Failed to infer contact profile',
		);

		// Return existing profile on error, or empty object if no existing profile
		return existingProfile || {};
	}
}
