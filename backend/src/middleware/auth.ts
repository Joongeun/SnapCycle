import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface AuthedRequest extends Request {
  userId?: string;
}

/**
 * Verifies the Supabase JWT in the Authorization header. Without a valid token
 * the request never reaches Claude — this protects the (paid) Anthropic API
 * behind real user authentication.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing bearer token' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    req.userId = data.user.id;
    next();
  } catch {
    return res.status(401).json({ message: 'Auth verification failed' });
  }
}
