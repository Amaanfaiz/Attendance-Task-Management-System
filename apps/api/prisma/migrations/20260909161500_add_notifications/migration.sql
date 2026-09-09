-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'MISSING_CLOCK_OUT', 'LONG_RUNNING_TIMER', 'UNALLOCATED_TIME');

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "longRunningTimerCooldownMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "unallocatedTimeThresholdMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "unallocatedReminderCutoffHourUtc" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "notificationsEmailEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "taskId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_dedupeKey_idx" ON "notifications"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
