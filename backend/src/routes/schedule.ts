import { Router, type Response } from 'express';
import type { AuthedRequest } from '../middleware/auth.js';
import { draftSchedule } from '../services/claude.js';

export const scheduleRouter = Router();

scheduleRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const { serviceName, itemName, decision, date } = req.body ?? {};

  if (
    typeof serviceName !== 'string' ||
    typeof itemName !== 'string' ||
    typeof decision !== 'string' ||
    typeof date !== 'string'
  ) {
    return res.status(400).json({ message: 'Invalid request body' });
  }

  try {
    const result = await draftSchedule({ serviceName, itemName, decision, date });
    res.json(result);
  } catch (e: any) {
    console.error('draftSchedule failed:', e?.message);
    res.status(502).json({ message: 'Scheduling failed. Please try again.' });
  }
});
