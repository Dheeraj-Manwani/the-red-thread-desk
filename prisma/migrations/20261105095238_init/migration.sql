-- CreateEnum
CREATE TYPE "TriggerScope" AS ENUM ('POSTS', 'ALL_POSTS', 'DEFAULT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('AWAITING_TAP', 'AWAITING_FOLLOW', 'LINK_SENT');

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "username" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "igsid" TEXT NOT NULL,
    "dmIgsid" TEXT,
    "username" TEXT,
    "name" TEXT,
    "isFollower" BOOLEAN,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentTrigger" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scope" "TriggerScope" NOT NULL DEFAULT 'POSTS',
    "mediaIds" TEXT[],
    "keywords" TEXT[],
    "excludeWords" TEXT[],
    "publicReplies" TEXT[],
    "dmText" TEXT NOT NULL,
    "dmButtonText" TEXT NOT NULL DEFAULT 'Send me the link',
    "followGate" BOOLEAN NOT NULL DEFAULT true,
    "followPromptText" TEXT NOT NULL DEFAULT 'Follow us first, then tap the button below and the link is yours.',
    "followButtonText" TEXT NOT NULL DEFAULT 'I''ve followed',
    "linkUrl" TEXT NOT NULL,
    "linkMessage" TEXT NOT NULL DEFAULT 'Here''s your link:',
    "oncePerPerson" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentTrigger_pkey" PRIMARY KEY ("id")
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
    "commentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fromIgsid" TEXT NOT NULL,
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
    "contactId" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'AWAITING_TAP',
    "followChecks" INTEGER NOT NULL DEFAULT 0,
    "linkSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contactId" TEXT,
    "triggerId" TEXT,
    "sessionId" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "firstClickedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_igUserId_key" ON "InstagramAccount"("igUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_igsid_key" ON "Contact"("igsid");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_dmIgsid_key" ON "Contact"("dmIgsid");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_dedupeKey_key" ON "WebhookEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_commentId_key" ON "Comment"("commentId");

-- CreateIndex
CREATE INDEX "Comment_mediaId_fromIgsid_triggerId_idx" ON "Comment"("mediaId", "fromIgsid", "triggerId");

-- CreateIndex
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LinkSession_commentId_key" ON "LinkSession"("commentId");

-- CreateIndex
CREATE INDEX "LinkSession_contactId_status_idx" ON "LinkSession"("contactId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ShortLink_sessionId_key" ON "ShortLink"("sessionId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "CommentTrigger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSession" ADD CONSTRAINT "LinkSession_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSession" ADD CONSTRAINT "LinkSession_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "CommentTrigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSession" ADD CONSTRAINT "LinkSession_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "CommentTrigger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortLink" ADD CONSTRAINT "ShortLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LinkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
