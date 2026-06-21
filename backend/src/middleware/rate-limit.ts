import rateLimit from 'express-rate-limit';
import type { AuthedRequest } from './auth';

/**
 * Per-user rate limit on the Claude-backed endpoints. Keyed by the verified
 * Supabase user id (falls back to IP) so one account can't burn the Anthropic
 * budget. This is the server-side counterpart to the client-side soft limit.
 */
export const claudeRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 40, // 40 Claude-backed calls per user per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthedRequest).userId ?? req.ip ?? 'anon',
  message: { message: 'Rate limit exceeded. Please try again later.' },
});
