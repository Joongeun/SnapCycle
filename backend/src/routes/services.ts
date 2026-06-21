import { Router, type Response } from 'express';
import type { AuthedRequest } from '../middleware/auth.js';
import { discoverServices, type ServicesInput } from '../services/claude.js';

export const servicesRouter = Router();

const DECISIONS = ['DONATE', 'SELL', 'DISCARD'];

servicesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const { itemName, category, condition, decision, location } = req.body ?? {};

  if (
    typeof itemName !== 'string' ||
    typeof category !== 'string' ||
    typeof condition !== 'string' ||
    typeof location !== 'string' ||
    !DECISIONS.includes(decision)
  ) {
    return res.status(400).json({ message: 'Invalid request body' });
  }

  try {
    const services = await discoverServices({
      itemName,
      category,
      condition,
      decision,
      location,
    } as ServicesInput);
    res.json({ services });
  } catch (e: any) {
    console.error('discoverServices failed:', e?.message);
    res.status(502).json({ message: 'Service discovery failed. Please try again.' });
  }
});
