-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('ACTIVE', 'ON_BREAK', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BreakRecordStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TO_DO', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskTimeEntryStatus" AS ENUM ('RUNNING', 'CLOSED');

-- CreateEnum
CREATE TYPE "CorrectionTargetType" AS ENUM ('ATTENDANCE_SESSION', 'BREAK_RECORD', 'TASK_TIME_ENTRY');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "employeeNumber" TEXT,
    "departmentId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockOutAt" TIMESTAMP(3),
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_records" (
    "id" TEXT NOT NULL,
    "attendanceSessionId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "BreakRecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "break_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TO_DO',
    "dueDate" TIMESTAMP(3),
    "estimatedMinutes" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_time_entries" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceSessionId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "TaskTimeEntryStatus" NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "task_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_requests" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "targetType" "CorrectionTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "proposedStart" TIMESTAMP(3),
    "proposedEnd" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "requireRegistrationApproval" BOOLEAN NOT NULL DEFAULT true,
    "employeesCanCreateTasks" BOOLEAN NOT NULL DEFAULT true,
    "sessionInactivityTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "missingClockOutThresholdMinutes" INTEGER NOT NULL DEFAULT 600,
    "longRunningTimerThresholdMinutes" INTEGER NOT NULL DEFAULT 240,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeNumber_key" ON "users"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "attendance_sessions_userId_status_idx" ON "attendance_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "break_records_attendanceSessionId_status_idx" ON "break_records"("attendanceSessionId", "status");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_status_idx" ON "tasks"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "task_time_entries_userId_status_idx" ON "task_time_entries"("userId", "status");

-- CreateIndex
CREATE INDEX "task_time_entries_taskId_idx" ON "task_time_entries"("taskId");

-- CreateIndex
CREATE INDEX "correction_requests_status_idx" ON "correction_requests"("status");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_records" ADD CONSTRAINT "break_records_attendanceSessionId_fkey" FOREIGN KEY ("attendanceSessionId") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_attendanceSessionId_fkey" FOREIGN KEY ("attendanceSessionId") REFERENCES "attendance_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BR-002 / AC-003-001-03 / AC-003-004-04: at most one non-completed attendance
-- session per user, enforced at the database level (not just application logic).
CREATE UNIQUE INDEX "attendance_sessions_one_active_per_user" ON "attendance_sessions" ("userId") WHERE "status" IN ('ACTIVE', 'ON_BREAK');

-- BR-003 / AC-006-001-04 / AC-006-007-01: at most one running task timer per user.
CREATE UNIQUE INDEX "task_time_entries_one_running_per_user" ON "task_time_entries" ("userId") WHERE "status" = 'RUNNING';

-- One active (not-yet-ended) break per attendance session.
CREATE UNIQUE INDEX "break_records_one_active_per_session" ON "break_records" ("attendanceSessionId") WHERE "status" = 'ACTIVE';
