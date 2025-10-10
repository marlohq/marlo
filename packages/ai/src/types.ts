import type { UIMessage } from 'ai';

// UI message used across chat systems with message-level metadata.
// Includes an optional millisecond timestamp set on both client (initial messages)
// and server (assistant responses) via AI SDK message metadata.
export type UIChatMessage = UIMessage<{ timestamp?: number }>;
