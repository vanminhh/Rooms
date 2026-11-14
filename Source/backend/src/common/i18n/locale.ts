export type Lang = 'vi' | 'en';

// Q-EX3-4: preserve registration's first-language matching, including en-US/en-GB.
export function localeOf(req: { headers?: Record<string, unknown> }): Lang {
  const value = req.headers?.['accept-language'];
  return typeof value === 'string' && /^en\b/i.test(value) ? 'en' : 'vi';
}

export function isTranslatedPath(path?: string): boolean {
  return /^\/api\/v1\/(public|auth|me)(\/|$)/.test(path ?? '');
}

export function mailLocale(user: { role: string; locale: string }): Lang {
  return (user.role === 'GUEST' || user.role === 'TENANT') && user.locale === 'en' ? 'en' : 'vi';
}
