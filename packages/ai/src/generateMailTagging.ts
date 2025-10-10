import { logger as baseLogger } from '@workspace/core/logger.js';
import type { MailReport } from '@workspace/core/types.ts';
import { generateObject } from 'ai';
import { z } from 'zod';
import { MODELS } from './util.ts';

const logger = baseLogger.child({ namespace: 'ai' });

const ORDER_DEFINITION = `
## Order (ID: 'ORDER')

An order is a confirmation of a purchase or transaction that has been completed (a receipt).

Some emails may discuss or mention a transaction, or quote a price for a product or service, without providing confirmation that the actual transaction has been completed. An email MUST contain confirmation of the transaction to be considered a valid order.

Caveat: Some emails may pass as valid for both "RESERVATION" and "ORDER" categories. In that case, return "RESERVATION".

Caveat: Some emails may pass as valid for both "INVOICE" and "ORDER" categories. In that case, return "ORDER".

Examples of order emails:
- Purchase confirmations from online retailers
- Transaction receipts with itemized details
- Order confirmations with multiple products or services
- Transaction receipt for a reservaation (hotels, flights, events, etc.)
- Subscription purchase confirmations
- Digital product purchase confirmations

### Common Metadata
- Transaction amount
- Transaction currency
- Order number
- Merchant/vendor name

### Examples
\`\`\`md
Subject: Your Amazon.com order has been confirmed

Thank you for your order!

Order #123-4567890-1234567
Order Total: $89.97

Items:
- Wireless Headphones - $59.99
- Phone Case - $29.98

Estimated delivery: March 15, 2024
\`\`\`
`.trim();

const PARCEL_DELIVERY_DEFINITION = `
## Parcel Delivery (ID: 'PARCEL_DELIVERY')

Use this category to describe package delivery status. These emails provide updates about the shipping and delivery process of physical packages.

Examples of parcel delivery emails:
- Shipping confirmations with tracking numbers
- Package tracking updates (in transit, out for delivery, etc.)
- Delivery confirmations
- Delivery attempt notifications
- Package pickup notifications
- Shipping delays or issues
- Return shipping notifications

### Common Metadata (not all fields are present in all emails)
- Carrier/shipping tracking number
- Delivery status
- Carrier/shipping company name (e.g., "UPS", "FedEx", "USPS", etc.)
- Order number or ID
- Expected delivery date

### Examples
\`\`\`md
Subject: Your package is out for delivery - UPS

Tracking Number: 1Z12345E0205271688

Your package is out for delivery and will arrive today by 8:00 PM.

You can track your package at ups.com
\`\`\`
`.trim();

const INVOICE_DEFINITION = `
## Invoice (ID: 'INVOICE')

Information about an invoice for payment. These are requests for payment, typically for services rendered or products delivered, often sent before payment is made. A statement -- like a credit card statement or bank statement -- is NOT an invoice even though it may look like one.

Examples of invoice emails:
- Bills for services (utilities, phone, internet, etc.)
- Professional service invoices (consulting, legal, medical, etc.)
- B2B payment requests

### Common Metadata
- Unique invoice ID (e.g., "INV-2024-001")
- Amount due
- Amount currency
- Due date
- Service provider/company name

### Examples
\`\`\`md
Subject: Invoice #INV-2024-001 - Due March 15

Invoice Details:
Invoice Number: INV-2024-001
Amount Due: $1,250.00
Due Date: March 15, 2024

Services:
- Web Development Services - February 2024

Please remit payment by the due date to avoid late fees.
\`\`\`
`.trim();

const RESERVATION_DEFINITION = `
## Reservation (ID: 'RESERVATION')

Confirmation emails for reservations, bookings, and tickets for various services and events. These emails confirm your reservation (or attendance) and typically include booking details and confirmation numbers.

Examples of reservation emails:
- Flight reservations and boarding passes
- Train and bus ticket confirmations
- Car rental confirmations
- Hotel bookings confirmations
- Restaurant reservation confirmations
- Live event tickets confirmations
- Museum, theater, tours and activity ticket confirmations
- Appointment confirmations (medical, salon, etc.)

### Common Metadata
- Reservation/confirmation number
- Service provider name (airline, restaurant, venue, etc.)
- Date and time of reservation
- Location/venue name
- Number of guests/tickets (if applicable)

### Examples
\`\`\`md
Subject: Your flight confirmation - American Airlines

Confirmation Number: ABC123

Flight Details:
AA1234 - March 20, 2024
Departure: New York (JFK) 2:30 PM
Arrival: Los Angeles (LAX) 5:45 PM

Passenger: John Smith
\`\`\`

\`\`\`md
Subject: Reservation confirmed - The Blue Bistro

Thank you for your reservation!

Reservation Details:
Date: Saturday, March 16, 2024
Time: 7:30 PM
Party Size: 4 guests
Confirmation #: RES789

The Blue Bistro
123 Main Street, Downtown
\`\`\`
`.trim();

const PROMOTION_DEFINITION = `
## Promotion (ID: 'PROMOTION')

All promotional marketing emails. This category includes customer surveys or similar requests for feedback from a company.

### Common Metadata
- Name of the service or company that sent the notification (e.g., "GitHub", "Figma", "Notion", etc.)

`.trim();

const NEWSLETTER_DEFINITION = `
## Newsletter (ID: 'NEWSLETTER')

A newsletter is a regularly distributed publication that provides updates, news, or other content to a specific audience of subscribers. A newsletter is always a written, longer-form publication. A newsletter is educational and entertaining, usually one or more pieces of writing around a specific topic or theme that is of interest to the recipient.

A newsletter's primary purpose is to be enjoyed by the reader. It's primary purpose is not self-promotion, notification, or transactional. Those should be categorized as a "promotional" or "notification" email instead.

A newsletter is always published as a part of a larger series. You do not have access to past messages to make this determination, but use the information you do have to make your best informed guess. For example:
- If the email referrer to itself as a newsletter (e.g., "Unsubscribe from this newsletter")
- If the email is a single edition or a larger named series (ex: "JavaScript Daily", "This Month in Remix", etc.)
- If the email refers to itself as an "issue" or "edition" (e.g., "Issue 123: The latest news in AI")

### Common Metadata
- Newsletter series name (e.g., "JavaScript Daily", "This Month in Remix", etc.)

`.trim();

const JUNK_DEFINITION = `
## Junk (ID: 'JUNK')

### Definition
A "Junk" email is a specific kind of cold outreach email. It is sent from a human and addressed directly to the recipient, almost as if it were a personal correspondence. It offers some opportunity to the recipient, like a service or investment opportunity. The senders larger goal is their own financial gain, often by first building a relationship with the recipient. The senders more immediate goal is often to get you to perform an action, like a reply or attending a call/meeting.

Junk email is very similar to "promotions" emails. The main distinction is that the sender is a named person (not just the company name) and the form mimics a personal outreach.

Caveat: If the sender is following up on a previous conversation or meeting, then it might not be junk email because it doesn't meet the "cold" outreach criteria. In that case, it is probably a "conversation" email instead. Consider this point in making your determination, but also consider that a sneaky junk sender would try to trick you into thinking it's a personal email when it's actually a cold outreach email.

### Common Metadata
None

### Examples
\`\`\`md
Did you get a look at this list of candidates Fred?

I have quite a few data engineers here in the US looking for their next role.

Can I share with you their profiles?

Best,
Christopher Garzon
CEO Data Engineer Academy
New York, NY
\`\`\`

Example:
\`\`\`md
Subject: Had to ask you this, Fred

Hi Fred,

We help Astro secure more clients by bringing in 3-5 sales meetings every single week with qualified leads using our cold outreach system—without relying on referrals or spending a dime on paid ads. It's completely done-for-you.

Here's what we've delivered for some of our clients:

$2M added to the sales pipeline in just 8 months
$520K in pipeline value created in just 90 days
31 qualified leads generated in 90 days
$145.8K in new revenue generated for a $200/month SaaS in 9 months

Would it be worth a quick chat?

Larry


PS: We work 100% on performance basis. If you don't get results, you pay nothing.
\`\`\`
`.trim();

const AUTHENTICATION_DEFINITION = `
## Authentication (ID: 'AUTHENTICATION')

An authentication email is a subcategory of "NOTIFICATION" that includes 2FA emails, passwordless login "magic links", password reset, notifications of login attempts, or any other account security-related emails. These emails are usually brief, transactional, automated, and contain no/minimal marketing content. They serve a single functional purpose: to facilitate secure access to an online service or platform.

Examples of authentication emails:
- 2FA authentication codes (e.g., 6-digit codes)
- 2FA authentication secure links
- Authentication "magic links" for passwordless login
- Email verification links for new account setup
- Password reset codes or secure links
- Account verification or confirmation codes
- Login attempt notifications (successful or otherwise)
- An Oauth 2.0 authorization request (e.g., "Authorize access to your Google account")
- A authorization security alert (e.g., "You allowed ReceiptScanner access to some of your Stripe data")

### Examples
\`\`\`md
Subject: Your verification code for GitHub

Your GitHub verification code is: 123456

This code will expire in 10 minutes.
\`\`\`

\`\`\`md
Subject: Sign in to Notion

Click here to sign in to your Notion account:
https://www.notion.so/login/magic-link?token=abc123

This link will expire in 1 hour.
\`\`\`

\`\`\`md
Subject: Successful login to your Dropbox account

We noticed a new login to your Dropbox account from:
Location: San Francisco, CA
Device: Chrome on Windows
Time: March 15, 2024 at 3:42 PM PST

If this was you, no action is needed. If this wasn't you, please secure your account immediately.
\`\`\`

\`\`\`md
Subject: Reset your password for Stripe

Someone requested a password reset for your Stripe account. If this was you, click the link below to reset your password:

https://dashboard.stripe.com/reset-password?token=xyz789

This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
\`\`\`
`.trim();

const UPDATE_DEFINITION = `
## Notification (ID: 'NOTIFICATION')

An notification email is any automated email sent from a third-party service notifying you about some activity from that service that is relevant to you and/or your account.

Some examples include:
- A notification from a social media platform about a new follower
- A notification from your bank about a new transaction
- A notification from your office about a new mail
- A notification from a service (ex: GitHub, Figma, Notion, etc) about some activity on your account, like a new comment or reply.
- A notification about a company's change to their terms of service (this affects your account)
- A notification about changing hours of operation to your local community pool (this affects your account)

*Caveat:* Promotional emails from companies may disguise themselves to look like genuine notifications. Instead of notifying you about actual activity on your account, they will notify about something more generic, or promotional in nature. Do not mistake these promotional emails as notifications! A notification always represents actual account activity from the use of their service and/or platform.

`.trim();

const CONVERSATION_DEFINITION = `
## Conversation (ID: 'CONVERSATION')

A conversation email is a personal communication between individuals, typically involving meaningful exchanges, follow-ups to previous discussions, or important messages from people you know. These emails are genuine personal or professional correspondence, not automated or mass-sent communications.

It is important that the email sender (from, fromName, fromEmail, etc.) is a human person, and not a company or service.

Caveat: This category is distinct from "junk" emails because conversation emails represent genuine, ongoing relationships and communications rather than cold outreach or unsolicited contact.

Examples of conversation emails:
- Personal emails from friends, family, or colleagues
- Follow-ups to previous meetings or discussions
- Project collaboration discussions
- Direct replies to your previous emails
- Important updates from known business contacts or clients
- Personal invitations or social arrangements
- Thank you notes or personal acknowledgments

### Examples
\`\`\`md
Subject: Re: Project timeline discussion

Hi Sarah,

Thanks for the meeting yesterday. I've reviewed the timeline we discussed and have a few thoughts on the Q2 deliverables.

Can we schedule a follow-up call next week to go over the details?

Best,
Mike
\`\`\`

\`\`\`md
Subject: Thanks for the introduction!

Hi John,

I wanted to thank you for introducing me to Lisa at the conference. We had a great conversation about the new marketing strategies.

I'll be sure to follow up with her next week as discussed.

Appreciate it!
Alex
\`\`\`
`.trim();

function getPrompt(report: MailReport, contactScore: number) {
	return `# Task
Categorize the following email. Return the most correct category ID.

# Instructions
- Examine all information provided in the email report to make your determination.
- Consider your answer and review the definitions carefully before responding.
- Consider the "Common Metadata" for each category. If you cannot detect any of the listed metadata in the email, that is a signal that the email is likely not a valid match for that category.
- If you are confident that the email matches a category definition, return the category ID.
- If you cannot find a confident match, return "NONE".
- If you feel the email is a match for multiple categories, return the category that best fits. If one of the matching categories is defined as a "subcategory" of the other, return the subcategory.
- Explain your reasoning. Provide a short summary of the key elements in the email summary that led to your decision.
- Consider the Contact Score provided. A low (under 0) contact score is a signal that the email may be less relevant to the recipient. A high (250+) contact score is a signal that the email may be more relevant to the recipient, even if the email itself may fit a negatively-perceived category like "JUNK", it's more likely to be a genuine email from a known contact and should be categorized as "NONE" or "CONVERSATION" instead.

# Categories

${AUTHENTICATION_DEFINITION}

${ORDER_DEFINITION}

${INVOICE_DEFINITION}

${PARCEL_DELIVERY_DEFINITION}

${RESERVATION_DEFINITION}

${NEWSLETTER_DEFINITION}

${PROMOTION_DEFINITION}

${UPDATE_DEFINITION}

${CONVERSATION_DEFINITION}

${JUNK_DEFINITION}

# Email Report:
${JSON.stringify(report)}

# Contact Score
${contactScore}`;
}

export async function categorizeMessage({
	messageId,
	contactScore,
	report,
}: {
	messageId: string;
	contactScore: number;
	report: MailReport;
}) {
	const timer = performance.now();
	let result;
	let usage;
	try {
		const response = await generateObject({
			model: MODELS['gemini-2.0-flash'],
			prompt: getPrompt(report, contactScore),
			schema: z.object({
				category: z.enum([
					'NONE',
					'JUNK',
					'CONVERSATION',
					'PROMOTION',
					'NEWSLETTER',
					'ORDER',
					'PARCEL_DELIVERY',
					'INVOICE',
					'RESERVATION',
					'NOTIFICATION',
					'AUTHENTICATION',
				]),
				reasoningText: z.string(),
			}),
		});
		result = response.object;
		usage = response.usage;
	} catch (error) {
		// Sanitize the error to prevent logging email content
		const sanitizedError = new Error(
			`Failed to categorize message ${messageId}: ${error instanceof Error ? error.message : String(error)}`,
		);
		if (error instanceof Error && error.stack) {
			sanitizedError.stack = error.stack;
		}
		logger.error({ messageId, error: sanitizedError }, 'Failed to categorize message');
		throw sanitizedError;
	}
	logger.debug(
		{
			messageId,
			result: { category: result.category },
			duration: performance.now() - timer,
			usage,
		},
		'mail tagging',
	);

	return {
		category: result.category,
		reasoningText: result.reasoningText,
	};
}
