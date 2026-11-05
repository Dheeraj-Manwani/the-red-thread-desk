-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "TriggerKind" AS ENUM ('COMMENT', 'STORY_REPLY', 'DM_KEYWORD');

-- CreateEnum
CREATE TYPE "TriggerScope" AS ENUM ('POSTS', 'ALL_POSTS', 'DEFAULT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('AWAITING_TAP', 'AWAITING_FOLLOW', 'LINK_SENT');

-- CreateEnum
CREATE TYPE "FlowRunStatus" AS ENUM ('WAITING_BUTTON', 'WAITING_ANSWER', 'WAITING_FOLLOW', 'WAITING_REPLY', 'WAITING_PAYMENT', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('CONTACT', 'BOT', 'ADMIN', 'APP');

-- CreateEnum
CREATE TYPE "OrderStage" AS ENUM ('LEAD', 'PAYMENT_SENT', 'PAID', 'DETAILS', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "username" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalId" TEXT NOT NULL,
    "dmId" TEXT,
    "username" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "marketingOptInAt" TIMESTAMP(3),
    "isFollower" BOOLEAN,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "lastInboundAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "handoffUntil" TIMESTAMP(3),
    "handoffAskedAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trigger" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "channel" "Channel" NOT NULL DEFAULT 'INSTAGRAM',
    "kind" "TriggerKind" NOT NULL DEFAULT 'COMMENT',
    "scope" "TriggerScope" NOT NULL DEFAULT 'POSTS',
    "mediaIds" TEXT[],
    "intents" TEXT[],
    "keywords" TEXT[],
    "excludeWords" TEXT[],
    "publicReplies" TEXT[],
    "flowId" TEXT,
    "dmText" TEXT NOT NULL DEFAULT '',
    "dmButtonText" TEXT NOT NULL DEFAULT 'Send me the link',
    "followGate" BOOLEAN NOT NULL DEFAULT true,
    "followPromptText" TEXT NOT NULL DEFAULT 'Follow us first, then tap the button below and the link is yours.',
    "followButtonText" TEXT NOT NULL DEFAULT 'I''ve followed',
    "linkUrl" TEXT NOT NULL DEFAULT '',
    "linkMessage" TEXT NOT NULL DEFAULT 'Here''s your link:',
    "oncePerPerson" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "commentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "fromUsername" TEXT,
    "contactId" TEXT,
    "triggerId" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "error" TEXT,
    "publicReplyId" TEXT,
    "dmSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkSession" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "contactId" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "commentId" TEXT,
    "storyId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'AWAITING_TAP',
    "followChecks" INTEGER NOT NULL DEFAULT 0,
    "initialFollower" BOOLEAN,
    "followGained" BOOLEAN NOT NULL DEFAULT false,
    "linkSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IceBreaker" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "question" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "linkUrl" TEXT,
    "flowId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IceBreaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contactId" TEXT,
    "triggerId" TEXT,
    "sessionId" TEXT,
    "iceBreakerId" TEXT,
    "flowRunId" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "firstClickedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "graph" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "flowId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "triggerId" TEXT,
    "commentId" TEXT,
    "storyId" TEXT,
    "status" "FlowRunStatus" NOT NULL DEFAULT 'WAITING_REPLY',
    "nodeId" TEXT,
    "vars" JSONB NOT NULL DEFAULT '{}',
    "followGained" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactTag" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceInr" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "contactId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "source" "MessageSource" NOT NULL,
    "text" TEXT NOT NULL,
    "buttons" TEXT[],
    "mid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogueItem" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occasion" TEXT,
    "imageUrl" TEXT,
    "previewUrl" TEXT,
    "priceInr" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "showInCarousel" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "channel" "Channel" NOT NULL,
    "contactId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountInr" INTEGER NOT NULL,
    "packageId" TEXT,
    "designId" TEXT,
    "flowRunId" TEXT,
    "stage" "OrderStage" NOT NULL DEFAULT 'PAYMENT_SENT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "razorpayLinkId" TEXT,
    "razorpayLinkUrl" TEXT,
    "razorpayPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "details" JSONB NOT NULL DEFAULT '{}',
    "eventDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL,
    "status" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "metaId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "tag" TEXT,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "estimatedCostInr" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "waMessageId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_channel_key" ON "Account"("channel");

-- CreateIndex
CREATE INDEX "Contact_lastMessageAt_idx" ON "Contact"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_channel_externalId_key" ON "Contact"("channel", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_channel_dmId_key" ON "Contact"("channel", "dmId");

-- CreateIndex
CREATE INDEX "Trigger_channel_kind_active_idx" ON "Trigger"("channel", "kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_dedupeKey_key" ON "WebhookEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "Comment_channel_mediaId_fromId_triggerId_idx" ON "Comment"("channel", "mediaId", "fromId", "triggerId");

-- CreateIndex
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_channel_commentId_key" ON "Comment"("channel", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSession_commentId_key" ON "LinkSession"("commentId");

-- CreateIndex
CREATE INDEX "LinkSession_contactId_status_idx" ON "LinkSession"("contactId", "status");

-- CreateIndex
CREATE INDEX "LinkSession_linkSentAt_idx" ON "LinkSession"("linkSentAt");

-- CreateIndex
CREATE INDEX "IceBreaker_channel_position_idx" ON "IceBreaker"("channel", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_sessionId_key" ON "ShortLink"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowRun_commentId_key" ON "FlowRun"("commentId");

-- CreateIndex
CREATE INDEX "FlowRun_contactId_status_updatedAt_idx" ON "FlowRun"("contactId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Message_contactId_createdAt_idx" ON "Message"("contactId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_mid_key" ON "Message"("channel", "mid");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueItem_externalId_key" ON "CatalogueItem"("externalId");

-- CreateIndex
CREATE INDEX "CatalogueItem_active_showInCarousel_occasion_idx" ON "CatalogueItem"("active", "showInCarousel", "occasion");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_razorpayLinkId_key" ON "Order"("razorpayLinkId");

-- CreateIndex
CREATE INDEX "Order_stage_updatedAt_idx" ON "Order"("stage", "updatedAt");

-- CreateIndex
CREATE INDEX "Order_contactId_idx" ON "Order"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WaTemplate_name_language_key" ON "WaTemplate"("name", "language");

-- CreateIndex
CREATE INDEX "Broadcast_status_scheduledAt_idx" ON "Broadcast"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRecipient_waMessageId_key" ON "BroadcastRecipient"("waMessageId");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_contactId_key" ON "BroadcastRecipient"("broadcastId", "contactId");

-- CreateIndex
CREATE INDEX "AiUsage_month_idx" ON "AiUsage"("month");

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSession" ADD CONSTRAINT "LinkSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSession" ADD CONSTRAINT "LinkSession_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSession" ADD CONSTRAINT "LinkSession_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IceBreaker" ADD CONSTRAINT "IceBreaker_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LinkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_iceBreakerId_fkey" FOREIGN KEY ("iceBreakerId") REFERENCES "IceBreaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_flowRunId_fkey" FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_designId_fkey" FOREIGN KEY ("designId") REFERENCES "CatalogueItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_flowRunId_fkey" FOREIGN KEY ("flowRunId") REFERENCES "FlowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WaTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
