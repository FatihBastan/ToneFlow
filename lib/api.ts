/**
 * Returns the base URL for API calls.
 * In the browser (web), API routes are relative (/api/...).
 * In Capacitor (mobile), they must point to the deployed Vercel URL.
 */
export function getApiBase(): string {
  if (typeof window !== 'undefined' && (window as any).Capacitor) {
    // Running inside Capacitor — use the deployed API
    return process.env.NEXT_PUBLIC_API_URL || '';
  }
  // Running as a normal web app — relative URLs work
  return '';
}

export function apiUrl(path: string): string {
  return `${getApiBase()}${path}`;
}
