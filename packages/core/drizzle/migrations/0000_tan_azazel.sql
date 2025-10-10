CREATE TYPE "public"."AccountStatus" AS ENUM('ACTIVE', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."MessageAttachmentStatus" AS ENUM('PENDING', 'UPLOADED', 'FAILED', 'AI_PROCESSED', 'AI_FAILED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."MessageImportPriority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."MessageImportStatus" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."MessageRecipientType" AS ENUM('TO', 'CC', 'BCC');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('INACTIVE', 'ACTIVE', 'WAITLIST');--> statement-breakpoint
CREATE TABLE "Account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"remoteId" text NOT NULL,
	"scope" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"accessTokenEnc" text NOT NULL,
	"refreshTokenEnc" text,
	"accessTokenIv" "bytea" NOT NULL,
	"accessTokenAuthTag" "bytea" NOT NULL,
	"refreshTokenIv" "bytea",
	"refreshTokenAuthTag" "bytea",
	"tokenType" text DEFAULT 'Bearer' NOT NULL,
	"expiresAt" timestamp (3),
	"status" "AccountStatus" DEFAULT 'ACTIVE' NOT NULL,
	"historyId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"watchExpiration" timestamp (3),
	"contactsSyncToken" text,
	"otherContactsSyncToken" text,
	"pictureHash" text,
	"onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"errorCode" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AppInstallation" (
	"id" text PRIMARY KEY NOT NULL,
	"appId" text NOT NULL,
	"userId" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"state" jsonb NOT NULL,
	"settings" jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"accountId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AppThreadTag" (
	"id" text PRIMARY KEY NOT NULL,
	"appId" text NOT NULL,
	"threadId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChatConversation" (
	"id" text PRIMARY KEY NOT NULL,
	"threadId" text,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"title" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChatMessage" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"conversationId" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"parts" jsonb
);
--> statement-breakpoint
CREATE TABLE "Contact" (
	"id" text PRIMARY KEY NOT NULL,
	"remoteId" text NOT NULL,
	"userId" text NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"hash" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"accountId" text NOT NULL,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "Draft" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"remoteId" text NOT NULL,
	"messageId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"accountId" text NOT NULL,
	"lastSyncedAt" timestamp (3),
	"deletedAt" timestamp (3),
	"threadId" text
);
--> statement-breakpoint
CREATE TABLE "Invite" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"acceptedAt" timestamp (3),
	"acceptedByUserId" text
);
--> statement-breakpoint
CREATE TABLE "Label" (
	"id" text PRIMARY KEY NOT NULL,
	"remoteId" text NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"textColor" text,
	"backgroundColor" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"accountId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Message" (
	"id" text PRIMARY KEY NOT NULL,
	"remoteId" text NOT NULL,
	"userId" text NOT NULL,
	"threadId" text NOT NULL,
	"subject" text NOT NULL,
	"contentText" text,
	"contentHtml" text,
	"senderName" text,
	"senderEmail" text NOT NULL,
	"readAt" timestamp (3),
	"draftId" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"accountId" text NOT NULL,
	"snippet" text,
	"sentAt" timestamp (3) NOT NULL,
	"inReplyTo" text,
	"globalId" text,
	"deletedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "MessageAttachment" (
	"id" text PRIMARY KEY NOT NULL,
	"messageId" text NOT NULL,
	"filename" text NOT NULL,
	"hash" text NOT NULL,
	"filetype" text NOT NULL,
	"size" integer NOT NULL,
	"content" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"status" "MessageAttachmentStatus" DEFAULT 'PENDING' NOT NULL,
	"contentId" text
);
--> statement-breakpoint
CREATE TABLE "MessageLabel" (
	"id" text PRIMARY KEY NOT NULL,
	"messageId" text NOT NULL,
	"labelId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MessageRecipient" (
	"id" text PRIMARY KEY NOT NULL,
	"messageId" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"type" "MessageRecipientType" NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Signature" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"name" text,
	"content" text NOT NULL,
	"gmail" boolean DEFAULT false NOT NULL,
	"default" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Thread" (
	"id" text PRIMARY KEY NOT NULL,
	"remoteId" text NOT NULL,
	"userId" text NOT NULL,
	"resolvedAt" timestamp (3),
	"remindAt" timestamp (3),
	"reminderTriggeredAt" timestamp (3),
	"trashedAt" timestamp (3),
	"spammedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"accountId" text NOT NULL,
	"lastSentAt" timestamp (3) NOT NULL,
	"isImportant" boolean DEFAULT false NOT NULL,
	"deletedAt" timestamp (3),
	"triagedAt" timestamp (3)
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"stripeCustomerId" text NOT NULL,
	"status" "UserStatus" DEFAULT 'WAITLIST' NOT NULL,
	"subscriptionData" jsonb
);
--> statement-breakpoint
CREATE TABLE "ViewItem" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"viewId" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ViewThreadTag" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"threadId" text NOT NULL,
	"viewId" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AppInstallation" ADD CONSTRAINT "AppInstallation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AppInstallation" ADD CONSTRAINT "AppInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AppThreadTag" ADD CONSTRAINT "AppThreadTag_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Label" ADD CONSTRAINT "Label_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Label" ADD CONSTRAINT "Label_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MessageLabel" ADD CONSTRAINT "MessageLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "public"."Label"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MessageLabel" ADD CONSTRAINT "MessageLabel_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ViewItem" ADD CONSTRAINT "ViewItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ViewThreadTag" ADD CONSTRAINT "ViewThreadTag_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ViewThreadTag" ADD CONSTRAINT "ViewThreadTag_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."Thread"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Account_email_key" ON "Account" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Account_remoteId_key" ON "Account" USING btree ("remoteId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "AppInstallation_accountId_appId_key" ON "AppInstallation" USING btree ("accountId" text_ops,"appId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "AppThreadTag_appId_threadId_key" ON "AppThreadTag" USING btree ("appId" text_ops,"threadId" text_ops);--> statement-breakpoint
CREATE INDEX "Contact_accountId_email_idx" ON "Contact" USING btree ("accountId" text_ops,"email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Contact_accountId_remoteId_key" ON "Contact" USING btree ("accountId" text_ops,"remoteId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Contact_hash_key" ON "Contact" USING btree ("hash" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Draft_messageId_key" ON "Draft" USING btree ("messageId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Draft_remoteId_key" ON "Draft" USING btree ("remoteId" text_ops);--> statement-breakpoint
CREATE INDEX "Invite_email_idx" ON "Invite" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Invite_email_key" ON "Invite" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Label_accountId_remoteId_key" ON "Label" USING btree ("accountId" text_ops,"remoteId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Message_accountId_remoteId_key" ON "Message" USING btree ("accountId" text_ops,"remoteId" text_ops);--> statement-breakpoint
CREATE INDEX "Message_threadId_draftId_idx" ON "Message" USING btree ("threadId" text_ops,"draftId" text_ops);--> statement-breakpoint
CREATE INDEX "Message_threadId_idx" ON "Message" USING btree ("threadId" text_ops);--> statement-breakpoint
CREATE INDEX "Message_threadId_senderEmail_idx" ON "Message" USING btree ("threadId" text_ops,"senderEmail" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "MessageAttachment_hash_key" ON "MessageAttachment" USING btree ("hash" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "MessageLabel_messageId_labelId_key" ON "MessageLabel" USING btree ("messageId" text_ops,"labelId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "MessageRecipient_messageId_email_key" ON "MessageRecipient" USING btree ("messageId" text_ops,"email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Signature_accountId_gmail_key" ON "Signature" USING btree ("accountId" text_ops,"gmail");--> statement-breakpoint
CREATE INDEX "Thread_accountId_lastSentAt_idx" ON "Thread" USING btree ("accountId" text_ops,"lastSentAt" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Thread_accountId_remoteId_key" ON "Thread" USING btree ("accountId" text_ops,"remoteId" text_ops);--> statement-breakpoint
CREATE INDEX "Thread_accountId_updatedAt_idx" ON "Thread" USING btree ("accountId" text_ops,"updatedAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "Thread_lastSentAt_idx" ON "Thread" USING btree ("lastSentAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "Thread_lastSentAt_remindAt_idx" ON "Thread" USING btree ("lastSentAt" timestamp_ops,"remindAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "Thread_lastSentAt_resolvedAt_idx" ON "Thread" USING btree ("lastSentAt" timestamp_ops,"resolvedAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "Thread_lastSentAt_spammedAt_idx" ON "Thread" USING btree ("lastSentAt" timestamp_ops,"spammedAt" timestamp_ops);--> statement-breakpoint
CREATE INDEX "Thread_lastSentAt_trashedAt_idx" ON "Thread" USING btree ("lastSentAt" timestamp_ops,"trashedAt" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User" USING btree ("stripeCustomerId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ViewThreadTag_accountId_viewId_threadId_key" ON "ViewThreadTag" USING btree ("accountId" text_ops,"viewId" text_ops,"threadId" text_ops);

-- Thread
CREATE OR REPLACE FUNCTION public.notify_thread()
RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    PERFORM pg_notify('thread', NEW.id);
    RETURN NEW;
END;
$function$;

CREATE TRIGGER thread_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON public."Thread"
FOR EACH ROW EXECUTE FUNCTION public.notify_thread();

-- Label
CREATE OR REPLACE FUNCTION public.notify_label()
RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    PERFORM pg_notify('label', NEW.id);
    RETURN NEW;
END;
$function$;

CREATE TRIGGER label_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON public."Label"
FOR EACH ROW EXECUTE FUNCTION public.notify_label();

-- Account
CREATE OR REPLACE FUNCTION public.notify_account()
RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    PERFORM pg_notify('account', NEW.id);
    RETURN NEW;
END;
$function$;

CREATE TRIGGER account_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON public."Account"
FOR EACH ROW EXECUTE FUNCTION public.notify_account();

-- Contact
CREATE OR REPLACE FUNCTION public.notify_contact()
RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    PERFORM pg_notify('contact', NEW.id);
    RETURN NEW;
END;
$function$;

CREATE TRIGGER contact_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON public."Contact"
FOR EACH ROW EXECUTE FUNCTION public.notify_contact();

-- Draft
CREATE OR REPLACE FUNCTION public.notify_draft()
RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    PERFORM pg_notify('draft', NEW.id);
    RETURN NEW;
END;
$function$;

CREATE TRIGGER draft_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON public."Draft"
FOR EACH ROW EXECUTE FUNCTION public.notify_draft();

-- Signature Trigger
CREATE OR REPLACE FUNCTION public.notify_signature()
RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    PERFORM pg_notify('signature', NEW.id);
    RETURN NEW;
END;
$function$;

CREATE TRIGGER signature_notify_trigger
AFTER INSERT OR UPDATE OR DELETE ON public."Signature"
FOR EACH ROW EXECUTE FUNCTION public.notify_signature();
