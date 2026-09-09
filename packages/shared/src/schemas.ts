import { z } from 'zod';
import { TaskPriority, UserRole, UserStatus } from './enums';

// An HTML <select> bound to an optional UUID field (e.g. "Unassigned"/"None") submits
// an empty string, not undefined - z.string().uuid().optional() rejects that empty
// string (optional() only lets undefined through), so the field fails validation with
// no visible error tied to it, and the whole form silently does nothing on submit.
// Found live: creating a user without picking a department, or a task without picking
// an assignee, both failed this way. This preprocesses "" to undefined first so the
// rest of the validation behaves the way an optional field actually should.
const optionalUuid = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.string().uuid().optional(),
);
const optionalNullableUuid = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().uuid().nullable().optional(),
);

// Same empty-string problem for a plain optional text field like employeeNumber:
// "" and "" collide under a DB unique constraint (unlike two NULLs, which never
// conflict each other), so a blank field must become null/undefined, not "".
const optionalTrimmedString = (max: number) =>
  z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().max(max).optional(),
  );
const optionalNullableTrimmedString = (max: number) =>
  z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().max(max).nullable().optional(),
  );

// An <input type="date"> submits a plain "YYYY-MM-DD" string, but dueDate expects
// a full ISO datetime - convert to midnight UTC on that date, and treat "" as unset.
const optionalDueDate = z.preprocess(
  (val) => {
    if (typeof val !== 'string' || val.trim() === '') return undefined;
    return /^\d{4}-\d{2}-\d{2}$/.test(val) ? `${val}T00:00:00.000Z` : val;
  },
  z.string().datetime().optional(),
);

// react-hook-form's { valueAsNumber: true } turns a blank <input type="number">
// into NaN, not undefined - z.number().optional() only lets undefined through,
// so leaving an optional number field empty (the common case) failed validation
// with "Expected number, received nan" and blocked the whole form. Found live:
// creating a task with Estimated minutes left blank through the real form.
const optionalPositiveInt = z.preprocess(
  (val) => (typeof val === 'number' && Number.isNaN(val) ? undefined : val),
  z.number().int().positive().optional(),
);

// Shared minimum password policy — enforced identically client- and server-side (AC-001-001-03).
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  firstName: z.string().min(1).max(100),
  surname: z.string().min(1).max(100),
  email: z.string().email(),
  phoneNumber: z.string().min(1).max(30),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  dueDate: optionalDueDate,
  estimatedMinutes: optionalPositiveInt,
  assigneeId: optionalUuid,
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.string().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const startTaskTimerSchema = z.object({
  taskId: z.string().uuid(),
});
export type StartTaskTimerInput = z.infer<typeof startTaskTimerSchema>;

export const switchTaskSchema = z.object({
  taskId: z.string().uuid(),
});
export type SwitchTaskInput = z.infer<typeof switchTaskSchema>;

export const requestCorrectionSchema = z.object({
  targetType: z.enum(['ATTENDANCE_SESSION', 'BREAK_RECORD', 'TASK_TIME_ENTRY']),
  targetId: z.string().uuid(),
  proposedStart: z.string().datetime().optional(),
  proposedEnd: z.string().datetime().optional(),
  reason: z.string().min(10).max(2000),
});
export type RequestCorrectionInput = z.infer<typeof requestCorrectionSchema>;

export const decideCorrectionSchema = z.object({
  approve: z.boolean(),
  comment: z.string().max(2000).optional(),
});
export type DecideCorrectionInput = z.infer<typeof decideCorrectionSchema>;

export const adminCreateUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  surname: z.string().min(1).max(100),
  email: z.string().email(),
  phoneNumber: z.string().min(1).max(30),
  role: z.nativeEnum(UserRole).default(UserRole.EMPLOYEE),
  departmentId: optionalUuid,
  employeeNumber: optionalTrimmedString(50),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  surname: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().min(1).max(30).optional(),
  role: z.nativeEnum(UserRole).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  departmentId: optionalNullableUuid,
  employeeNumber: optionalNullableTrimmedString(50),
});
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

export const updateOwnProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  surname: z.string().min(1).max(100).optional(),
  phoneNumber: z.string().min(1).max(30).optional(),
});
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

export const rejectUserSchema = z.object({
  reason: z.string().max(2000).optional(),
});
export type RejectUserInput = z.infer<typeof rejectUserSchema>;

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(150),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateAppSettingsSchema = z
  .object({
    requireRegistrationApproval: z.boolean(),
    employeesCanCreateTasks: z.boolean(),
    sessionInactivityTimeoutMinutes: z.number().int().positive(),
    missingClockOutThresholdMinutes: z.number().int().positive(),
    longRunningTimerThresholdMinutes: z.number().int().positive(),
    longRunningTimerCooldownMinutes: z.number().int().positive(),
    unallocatedTimeThresholdMinutes: z.number().int().positive(),
    unallocatedReminderCutoffHourUtc: z.number().int().min(0).max(23),
    notificationsEmailEnabled: z.boolean(),
  })
  .partial();
export type UpdateAppSettingsInput = z.infer<typeof updateAppSettingsSchema>;

export const reportFilterSchema = z.object({
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
  userId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
export type ReportFilterInput = z.infer<typeof reportFilterSchema>;
