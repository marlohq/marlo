import { logger as baseLogger } from '@workspace/core/logger.js';
import type { SpaceProperty } from '@workspace/core/space.js';
import type { MailReport } from '@workspace/core/types.js';
import { generateObject } from 'ai';
import { z } from 'zod';
import { MODELS } from './util.js';

const logger = baseLogger.child({ module: 'ai/filter' });

// Schema for direct email evaluation against natural language queries
const EmailEvaluationSchema = z.object({
	results: z.array(
		z.object({
			query: z.string(),
			matches: z.boolean(),
		}),
	),
});

type EmailEvaluationResult = z.infer<typeof EmailEvaluationSchema>;

/**
 * Evaluates natural language queries directly against an email using AI Example: "mail author has a
 * gmail account" -> checks if from address contains "@gmail.com"
 */
export async function evaluateNaturalQueriesOnEmail(
	mailReport: MailReport,
	queries: string[],
): Promise<EmailEvaluationResult> {
	const timer = performance.now();

	try {
		const result = await generateObject({
			model: MODELS['gemini-2.0-flash'],
			schema: EmailEvaluationSchema,
			system: getEmailEvaluationSystemPrompt(),
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: buildEmailEvaluationPrompt(mailReport, queries),
						},
					],
				},
			],
		});

		logger.debug(
			{
				duration: performance.now() - timer,
				usage: result.usage,
				queriesCount: queries.length,
			},
			'Natural language queries evaluated against email',
		);

		return result.object;
	} catch (error) {
		logger.error(
			{ error, queries, duration: performance.now() - timer },
			'Failed to evaluate natural language queries against email',
		);
		throw error;
	}
}

function getEmailEvaluationSystemPrompt(): string {
	return `
# Email Query Evaluation Assistant

You are an expert at evaluating whether natural language queries match against specific emails.

## Your Task
You will be given email metadata and an AI-generated mail report, along with a list of natural language queries. For each query, determine:
1. **matches**: Does this email satisfy the query? (true/false)

## Guidelines
- **Use both sources**: Base your evaluation on both the email metadata (from, to, cc, subject, date, attachments, labels) and the AI-generated mail report content
- **Mail report priority**: The AI-generated mail report provides a cleaned, summarized version of the email content - use this for content-based queries
- **Handle ambiguity**: If a query could be interpreted multiple ways, use the most reasonable interpretation
- **Domain knowledge**: Apply common email patterns (e.g., "@gmail.com" means Gmail account)
- **Date interpretation**: Handle relative dates like "recent", "today", "this week" based on context
- **Case sensitivity**: Generally be case-insensitive unless case clearly matters

## Examples of Query Types
- Email addresses: "from Gmail account", "sent to work email"
- Content: "about meetings", "contains urgent", "mentions deadline"
- Timing: "sent today", "from last week", "recent email"
- Attachments: "has PDF attachment", "includes documents"
- Labels/Categories: "marked as important", "tagged as work"
- Relationships: "from my manager", "to external recipients"

Give clear yes/no answers based on the email metadata and mail report content.
`.trim();
}

function buildEmailEvaluationPrompt(mailReport: MailReport, queries: string[]): string {
	return `
## Email to Evaluate

${mailReport}

## Queries to Evaluate

${queries.map((query, index) => `${index + 1}. "${query}"`).join('\n')}

For each query, determine if this email matches the query criteria based on the email metadata and the AI-generated report above. Return only true or false for each query.
`.trim();
}

// Schema for property evaluation results
const PropertyEvaluationSchema = z.object({
	results: z.array(
		z.object({
			property: z.string(), // Property ID (not name)
			// TODO: Gemini or the ai-sdk doesn't support complex Zod types like unions,
			// just use string for now but we should fix this when we add support for numbers, boolean, etc. in the UI.
			// value: z.union([z.string(), z.boolean(), z.number()]),
			value: z.string(),
		}),
	),
});

type PropertyEvaluationResult = z.infer<typeof PropertyEvaluationSchema>;

/**
 * Evaluates view properties for an email using AI Example: For a Support space with "Priority"
 * property, determines if email is "High", "Medium", or "Low" priority
 */
export async function evaluatePropertiesOnEmail(
	mailReport: MailReport,
	properties: SpaceProperty[],
): Promise<PropertyEvaluationResult> {
	const timer = performance.now();

	try {
		const result = await generateObject({
			model: MODELS['gemini-2.5-flash'],
			schema: PropertyEvaluationSchema,
			system: getPropertyEvaluationSystemPrompt(),
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: buildPropertyEvaluationPrompt(mailReport, properties),
						},
					],
				},
			],
		});

		logger.debug(
			{
				duration: performance.now() - timer,
				usage: result.usage,
				propertiesCount: properties.length,
			},
			'Properties evaluated for email',
		);

		return result.object;
	} catch (error) {
		logger.error(
			{ error, properties: JSON.stringify(properties), duration: performance.now() - timer },
			'Failed to evaluate properties for email',
		);
		throw error;
	}
}

function getPropertyEvaluationSystemPrompt(): string {
	return `
# Email Property Evaluation Assistant

You are an expert at analyzing emails and determining appropriate property values based on email content and metadata.

## Your Task
You will be given email metadata, a mail report, and a list of properties to evaluate. For each property, determine the most appropriate value based on:
1. **Email metadata**: from, to, cc, subject, date, attachments, labels
2. **Mail report**: cleaned, summarized email content
3. **Property definition**: name, type, and any implicit context

## Property Types
- **string**: Choose exactly one value from the predefined list of options provided for each property
- **boolean**: Return true or false
- **numeric**: Return a number (e.g., 1, 2, 3 for priority levels)

## Guidelines
- **Context awareness**: Use common sense and domain knowledge (e.g., "urgent" keywords suggest high priority)
- **Predefined values**: For string properties, you MUST choose from the provided list of values - do not create new values
- **Email indicators**: Look for keywords, sender importance, subject urgency, etc.
- **Default values**: When uncertain, choose reasonable defaults from the available options
- **String properties**: Select the most appropriate value from the predefined list
- **Boolean properties**: Use clear true/false logic
- **Numeric properties**: Use logical scales appropriate for the property context

## Important Notes
- For string properties, the available values will be explicitly listed - choose exactly one from the list
- For boolean properties, return true or false based on the email content
- For numeric properties, return an appropriate number based on the context and scale implied by the property name

Analyze the email content carefully and provide appropriate values for each property according to their type and available options.
`.trim();
}

function buildPropertyEvaluationPrompt(
	mailReport: MailReport,
	properties: SpaceProperty[],
): string {
	return `
## Email to Evaluate

${mailReport}

## Custom Properties Overview

You are helping evaluate custom properties for an email filtering and organization system. Users have defined these properties to automatically categorize, prioritize, and organize their emails based on content, context, and metadata.

Each property below has a custom prompt written by the user that describes what they want to extract or determine about emails. Your job is to analyze the email content and determine the appropriate value for each property based on:
- The email's content and context
- The specific instructions in each property's prompt
- The property type constraints (string options, boolean, or numeric values)

## Properties to Evaluate

${properties
	.map((prop, index) => {
		return `${index + 1}. **${prop.name}** (${prop.type}) [ID: ${prop.id}]
   User's extraction prompt: "${prop.prompt}"`;
	})
	.join('\n\n')}

## Instructions

For each property above:
1. **Read the user's extraction prompt carefully** - this tells you exactly what they want to determine about the email
2. **Analyze the email content** in the context of that specific prompt
3. **Return the appropriate value** based on the property type:
   - **String properties**: Choose from the predefined options that best matches the user's intent
   - **Boolean properties**: Return true/false based on whether the email meets the criteria described in the prompt
   - **Numeric properties**: Return a number that represents the scale/level described in the prompt

**IMPORTANT**: When returning results, use the property ID (shown in brackets) as the "property" field, not the property name.

Consider the email's sender, subject, content, urgency indicators, and any other relevant context when determining each property value.
`.trim();
}
