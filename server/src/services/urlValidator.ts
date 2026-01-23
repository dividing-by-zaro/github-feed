/**
 * URL Validation Service for Documentation URLs
 *
 * Validates and sanitizes documentation URLs, with auto-detection
 * capabilities for common documentation hosting platforms.
 */

import { isIP } from 'net';

/**
 * Check if a hostname is a private/internal IP or localhost.
 * Blocks SSRF attacks against internal infrastructure.
 */
function isPrivateOrInternalHost(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();

  // Block localhost variations
  if (
    lowerHostname === 'localhost' ||
    lowerHostname === 'localhost.localdomain' ||
    lowerHostname.endsWith('.localhost')
  ) {
    return true;
  }

  // Check if it's an IP address
  if (isIP(hostname)) {
    const parts = hostname.split('.').map(Number);

    // IPv4 private ranges
    if (parts.length === 4) {
      // 127.0.0.0/8 (loopback)
      if (parts[0] === 127) return true;
      // 10.0.0.0/8 (private)
      if (parts[0] === 10) return true;
      // 172.16.0.0/12 (private)
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      // 192.168.0.0/16 (private)
      if (parts[0] === 192 && parts[1] === 168) return true;
      // 169.254.0.0/16 (link-local)
      if (parts[0] === 169 && parts[1] === 254) return true;
      // 0.0.0.0
      if (parts.every((p) => p === 0)) return true;
    }

    // Block IPv6 loopback and private ranges
    if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return true;
    }
  }

  return false;
}

/**
 * Validate and sanitize a user-provided documentation URL.
 *
 * Rules:
 * - Must be a valid URL
 * - Must be HTTPS only (rejects http:, javascript:, data:, etc.)
 * - Must not point to private/internal IPs (prevents SSRF)
 * - Strips query params and fragments
 *
 * @returns Sanitized URL or null if invalid
 */
export function validateDocsUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return null;
    }

    // Block private/internal hosts (SSRF protection)
    if (isPrivateOrInternalHost(parsed.hostname)) {
      return null;
    }

    // Return sanitized URL without query params and fragments
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    // Invalid URL format
    return null;
  }
}

/**
 * Auto-detect documentation URL from homepage and repo info.
 *
 * Priority:
 * 1. If homepage matches known doc hosts, use it
 * 2. Check if {owner}.github.io/{name} exists
 * 3. Return null if nothing found
 */
export async function detectDocsUrl(
  homepage: string | null,
  owner: string,
  name: string
): Promise<string | null> {
  // Priority 1: Check if homepage is on a known doc host
  if (homepage) {
    const validated = validateDocsUrl(homepage);
    if (validated) {
      return validated;
    }
  }

  // Priority 2: Check if GitHub Pages exists for this repo
  const githubPagesUrl = `https://${owner.toLowerCase()}.github.io/${name.toLowerCase()}`;
  const exists = await validateUrlExists(githubPagesUrl);
  if (exists) {
    return githubPagesUrl;
  }

  return null;
}

/**
 * Verify a URL exists by sending a HEAD request.
 * Returns true if the URL responds with a success status (2xx).
 */
export async function validateUrlExists(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
