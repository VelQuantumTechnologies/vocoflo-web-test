/**
 * Temporary Guest Review Mode configuration.
 *
 * Easy disable options:
 * 1. Set NEXT_PUBLIC_ENABLE_GUEST_REVIEW_MODE=false in Vercel / .env.local (recommended), OR
 * 2. Flip DEFAULT_GUEST_REVIEW_MODE_ENABLED to false below and redeploy.
 */
export const DEFAULT_GUEST_REVIEW_MODE_ENABLED = true;

export const GUEST_REVIEW_USER_ID = "guest_review_local";

export function isGuestReviewModeEnabled(
  envValue: string | undefined = process.env.NEXT_PUBLIC_ENABLE_GUEST_REVIEW_MODE
): boolean {
  if (envValue === undefined || envValue === null) {
    return DEFAULT_GUEST_REVIEW_MODE_ENABLED;
  }
  const normalized = String(envValue).trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_GUEST_REVIEW_MODE_ENABLED;
  }
  if (["false", "0", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }
  if (["true", "1", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  return DEFAULT_GUEST_REVIEW_MODE_ENABLED;
}
