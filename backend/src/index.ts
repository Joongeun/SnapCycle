import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { requireAuth } from './middleware/auth.js';
import { claudeRateLimit } from './middleware/rate-limit.js';
import { servicesRouter } from './routes/services.js';
import { scheduleRouter } from './routes/schedule.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// --- Security middleware -------------------------------------------------
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    // Expo native clients send no Origin header; allow those + any configured origins.
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'));
      }
    },
  })
);

app.use(express.json({ limit: '256kb' }));

// --- Health check (public) ----------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }));

// --- Protected, rate-limited Claude endpoints ---------------------------
// requireAuth runs first so the rate limiter can key on the verified user id,
// and so no unauthenticated request ever reaches the Anthropic API.
app.use('/api', requireAuth, claudeRateLimit);
app.use('/api/services', servicesRouter);
app.use('/api/schedule', scheduleRouter);

// --- Startup guard -------------------------------------------------------
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠️  ANTHROPIC_API_KEY is not set — Claude calls will fail.');
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_ANON_KEY not set — auth will reject all requests.');
}

app.listen(PORT, () => {
  console.log(`RRR2 backend listening on http://localhost:${PORT}`);
});
