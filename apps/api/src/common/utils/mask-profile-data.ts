// EP-013: bank account number is sensitive - never surfaces past the last 4
// digits in any steady-state response (self, admin, or audit log), the one
// exception being a pending ProfileChangeRequest's raw proposedData, which an
// admin must see in full to actually review what's being proposed before
// approving it.
export function maskProfileData<T extends Record<string, unknown> | null>(
  data: T,
): T {
  if (!data || typeof data !== 'object') return data;
  const value = (data as Record<string, unknown>).bankAccountNumber;
  if (typeof value !== 'string') return data;
  const masked =
    value.length > 4 ? `••••${value.slice(-4)}` : value;
  return { ...data, bankAccountNumber: masked };
}
