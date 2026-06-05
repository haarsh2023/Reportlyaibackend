require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspace');
const clientRoutes = require('./routes/clients');
const reportRoutes = require('./routes/reports');
const billingRoutes = require('./routes/billing');

const app = express();

// ── CORS ──
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000'
  ],
  credentials: true
}));

// ── Body parsing (skip for Cashfree webhook — needs raw body) ──
app.use((req, res, next) => {
  if (req.path === '/billing/webhook') return next();
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === '/billing/webhook') return next();
  express.urlencoded({ extended: true })(req, res, next);
});

// ── Rate limiting ──
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts, please try again later.' } });
app.use(limiter);

// ── Health check ──
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Routes ──
app.use('/auth', authLimiter, authRoutes);
app.use('/workspace', workspaceRoutes);
app.use('/clients', clientRoutes);
app.use('/reports', reportRoutes);
app.use('/billing', billingRoutes);

// ── 404 ──
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ ReportlyAI backend running on port ${PORT}`));
