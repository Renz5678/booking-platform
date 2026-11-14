/**
 * Returns true once a booking's scheduled_end timestamp is in the past.
 */
export function isBookingPast(
  scheduledEnd: string,
  nowMs = Date.now()
): boolean {
  const endMs = new Date(scheduledEnd).getTime();
  return Number.isFinite(endMs) && endMs <= nowMs;
}
