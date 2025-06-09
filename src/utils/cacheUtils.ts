/**
 * Cache utility functions
 */

/**
 * Extract parameters from colon-separated cache keys
 * @param key - Cache key like "analytics:1d" or "events:7d:100"
 * @returns Parameters after namespace:category or undefined if not found
 *
 * Examples:
 * - "analytics:1d" → "1d"
 * - "events:7d:100" → "7d:100"
 * - "quota:premium" → "premium"
 */
export function extractParamsFromKey(key: string): string | undefined {
  const parts = key.split(":");
  if (parts.length > 2) {
    return parts.slice(2).join(":"); // Join parameters after namespace:category
  } else if (parts.length === 2) {
    return parts[1]; // Single parameter like "analytics:1d" -> "1d"
  }
  return undefined;
}

/**
 * Validate if a cache key follows the expected colon-separated pattern
 * @param key - Cache key to validate
 * @returns true if key follows pattern namespace:category or namespace:category:params
 */
export function isValidCacheKey(key: string): boolean {
  const parts = key.split(":");
  return parts.length >= 2 && parts.every((part) => part.length > 0);
}
