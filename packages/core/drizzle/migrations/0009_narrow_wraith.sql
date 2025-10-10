SET timezone = 'UTC';
ALTER TABLE "Account" ALTER COLUMN "expiresAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "watchExpiration" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "AppInstallation" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "AppInstallation" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AppInstallation" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "AppInstallation" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ChatConversation" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "ChatConversation" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ChatConversation" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "ChatConversation" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ChatMessage" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "ChatMessage" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "ChatMessage" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Contact" ALTER COLUMN "deletedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Draft" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Draft" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Draft" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Draft" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Draft" ALTER COLUMN "lastSyncedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Draft" ALTER COLUMN "deletedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Invite" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Invite" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Invite" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Invite" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Invite" ALTER COLUMN "acceptedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Label" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Label" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Label" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Label" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "MCPServer" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MCPServer" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "MCPServer" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MCPServer" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "readAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "sentAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "deletedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MessageAttachment" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MessageAttachment" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "MessageAttachment" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MessageAttachment" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "MessageLabel" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MessageLabel" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "MessageLabel" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MessageLabel" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "MessageRecipient" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MessageRecipient" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "MessageRecipient" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "MessageRecipient" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Signature" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Signature" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Signature" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Signature" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Space" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Space" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Space" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Space" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SpaceAction" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceAction" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SpaceAction" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceAction" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SpaceActionRun" ALTER COLUMN "startedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceActionRun" ALTER COLUMN "completedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceActionRun" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceActionRun" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SpaceActionRun" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceActionRun" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SpaceItem" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceItem" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SpaceItem" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceItem" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "SpaceThreadTag" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "resolvedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "remindAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "reminderTriggeredAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "trashedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "spammedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "lastSentAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "deletedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "Thread" ALTER COLUMN "triagedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "ThreadCategory" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "ThreadCategory" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ThreadCategory" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "ThreadCategory" ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT now();
RESET timezone;
