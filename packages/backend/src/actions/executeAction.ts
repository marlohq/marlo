import { MODELS, serializeDetailedThread } from '@workspace/ai';
import type { Account, SpaceAction } from '@workspace/core/drizzle.ts';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { generateText, stepCountIs } from 'ai';
import { z } from 'zod';
import type { Tool } from '../tools/registry.ts';

const logger = baseLogger.child({ namespace: 'ai/executeAction' });

// Schema for action execution result
const ActionExecutionResultSchema = z.object({
	success: z.boolean(),
	reasoningText: z.string(),
	toolCalls: z.array(
		z.object({
			toolName: z.string(),
			parameters: z.record(z.unknown()),
			result: z.unknown().optional(),
		}),
	),
});

export type ActionExecutionResult = z.infer<typeof ActionExecutionResultSchema>;

export interface ActionContext {
	action: SpaceAction;
	space: {
		id: string;
		name: string;
		filters: unknown[];
		properties: unknown[];
	};
	account: Account;
	thread?: Parameters<typeof serializeDetailedThread>[0];
	previousRuns?: {
		id: string;
		status: string;
		result: unknown;
		completedAt: Date | null;
	}[];
}

function buildActionSystemPrompt(): string {
	return `
You are Marlo, an AI assistant that automates email workflows.

## Your Role
You help users automate repetitive email tasks. When given an automation prompt and email context, you:
1. Analyze the current email/thread situation
2. Decide what actions to take based on the automation prompt
3. Execute available tools to perform those actions
4. Provide clear reasoning for your decisions

## Available Tools
Currently available tools:
- createDraft: Create a draft email in response to a thread
- resolveThread: Mark a thread as resolved (completed)
- sendNotification: Send notifications or reports (useful for scheduled automations)
- search: Search for emails in the mailbox
- get_thread_details: Get full details of an email thread

## Guidelines
- Follow the automation prompt exactly as specified by the user
- Only use tools when necessary and appropriate
- Provide clear reasoning for your decisions
- If you can't fulfill the automation, explain why
- Avoid duplicate actions - check previous runs if provided
- Focus on practical email management tasks
- IMPORTANT: Only use the resolveThread tool if the user's automation prompt explicitly asks to resolve, close, or mark the thread as completed. Do not resolve threads automatically just because you're responding to them.

## Response Format
Respond with:
1. Your reasoning for what action to take
2. The specific tool calls you're making (if any)
3. Brief explanation of expected outcome

IMPORTANT: Always be helpful but conservative. Don't perform actions that seem unusual or potentially harmful.
`;
}

function buildActionPrompt(context: ActionContext): string {
	const { action, account, thread, previousRuns } = context;

	let prompt = `
# Email Automation Request

## Automation Task
- **Trigger**: ${action.triggerType}
- **Task**: ${action.prompt}

## Your Email Account
- **Account**: ${account.name ? `${account.name} <${account.email}>` : account.email}
`;

	if (thread) {
		prompt += `
## Email Thread
${serializeDetailedThread(thread)}
`;
	} else if (action.triggerType === 'cron') {
		prompt += `
## Cron Automation
This is a scheduled automation that runs periodically. It operates on your entire email account rather than a specific thread.
`;
	}

	if (previousRuns && previousRuns.length > 0) {
		prompt += `
## Recent Automation History
${previousRuns
	.map(
		(run) => `
- **Status**: ${run.status}
- **Completed**: ${run.completedAt?.toISOString() || 'Not completed'}
- **What was done**: ${JSON.stringify(run.result)}
`,
	)
	.join('\n')}
`;
	}

	prompt += `
## Instructions
Execute this automation task: "${action.prompt}"

${
	thread
		? 'Analyze the email thread and determine what action to take. If this automation has already been successfully completed recently, you may skip execution and explain why.'
		: 'This is a scheduled automation. Use the available tools to complete the requested task.'
}
`;

	return prompt;
}

export async function executeAction(
	context: ActionContext,
	tools?: Record<string, Tool>,
): Promise<ActionExecutionResult> {
	const timer = performance.now();

	try {
		const userPrompt = buildActionPrompt(context);

		logger.info(
			{
				actionId: context.action.id,
				triggerType: context.action.triggerType,
				threadId: context.thread?.id,
			},
			'Executing email automation',
		);

		// Log that we're sending a prompt to the LLM (without the actual prompt content)
		logger.info(
			{
				actionId: context.action.id,
				threadId: context.thread?.id,
			},
			'Sending action prompt to LLM',
		);

		const response = await generateText({
			model: MODELS['gemini-2.5-flash'],
			system: buildActionSystemPrompt(),
			prompt: userPrompt,
			tools: tools || {},
			stopWhen: stepCountIs(10), // Allow up to 10 tool calls in sequence
		});

		const result = response.text;
		const usage = response.usage;

		// Extract tool calls from the response
		// The AI library puts toolCalls and toolResults in step properties, not as individual steps
		const allSteps = response.steps || [];
		const toolSteps = allSteps; // Extract tool calls from any step that has them

		// Extract tool calls from the toolCalls array within each step
		const toolCalls = toolSteps.flatMap((step) => {
			// Explicitly type toolCalls and toolResults
			const stepToolCalls = (step.toolCalls ?? []) as {
				toolName: string;
				toolCallId: string;
				input: Record<string, unknown>;
			}[];
			const stepToolResults = (step.toolResults ?? []) as { toolCallId: string; output: unknown }[];

			// TODO debugging, remove
			const sr1 = stepToolResults.at(1);

			// Debug logging
			logger.info(
				{
					actionId: context.action.id,
					threadId: context.thread?.id,
					stepToolCallsLength: stepToolCalls.length,
					stepToolResultsLength: stepToolResults.length,
					stepToolCalls: stepToolCalls.map((tc) => ({
						toolName: tc.toolName,
						toolCallId: tc.toolCallId,
					})),
					stepToolResults: stepToolResults.map((tr) => ({
						toolCallId: tr.toolCallId,
						result: typeof tr.output,
					})),
				},
				'Debug: Tool calls and results in step',
			);

			// Match tool calls with their results by toolCallId
			return stepToolCalls.map((toolCall) => {
				const matchingResult = stepToolResults.find(
					(result) => result.toolCallId === toolCall.toolCallId,
				);
				return {
					toolName: toolCall.toolName,
					parameters: toolCall.input,
					result: matchingResult?.output,
				};
			});
		});

		// Log each tool call that was made
		if (toolCalls.length > 0) {
			logger.info(
				{
					actionId: context.action.id,
					threadId: context.thread?.id,
					toolCallCount: toolCalls.length,
				},
				'LLM made tool calls',
			);

			toolCalls.forEach((toolCall, index) => {
				logger.info(
					{
						actionId: context.action.id,
						threadId: context.thread?.id,
						toolCallIndex: index + 1,
						toolName: toolCall.toolName,
						parameters: JSON.stringify(toolCall.parameters),
					},
					`Tool call: ${toolCall.toolName}`,
				);
			});
		}

		// Log the final reasoning from the LLM
		logger.info(
			{
				actionId: context.action.id,
				threadId: context.thread?.id,
				reasoningText: result,
			},
			'LLM reasoning and response',
		);

		const executionResult: ActionExecutionResult = {
			success: true,
			reasoningText: result,
			toolCalls: toolCalls,
		};

		logger.info(
			{
				actionId: context.action.id,
				threadId: context.thread?.id,
				duration: performance.now() - timer,
				usage,
				toolCallCount: toolCalls.length,
			},
			'Email automation completed',
		);

		return executionResult;
	} catch (error) {
		// Sanitize the error to prevent logging sensitive context
		const sanitizedError = new Error(
			`Action execution failed for action ${context.action.id}: ${error instanceof Error ? error.message : String(error)}`,
		);

		if (error instanceof Error && error.stack) {
			sanitizedError.stack = error.stack;
		}

		logger.error(
			{
				actionId: context.action.id,
				threadId: context.thread?.id,
				error: sanitizedError,
			},
			'Failed to execute email automation',
		);

		throw sanitizedError;
	}
}
