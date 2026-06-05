const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const { sendWelcomeEmail } = require('../services/email');
const authMiddleware = require('../middleware/auth');

// ── REGISTER ──
router.post('/register', async (req, res) => {
  try {
    const { email, password, agency_name } = req.body;
    if (!email || !password || !agency_name) {
      return res.status(400).json({ error: 'Email, password and agency name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check existing user
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    // Create user
    const { error: userError } = await supabase.from('users').insert({
      id: userId,
      email: email.toLowerCase(),
      password_hash: passwordHash
    });
    if (userError) throw userError;

    // Create workspace
    const { error: wsError } = await supabase.from('workspaces').insert({
      id: uuidv4(),
      user_id: userId,
      agency_name: agency_name.trim(),
      plan: 'free',
      reports_used: 0,
      reports_limit: 1
    });
    if (wsError) throw wsError;

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, agency_name).catch(console.error);

    const token = jwt.sign(
      { userId, email: email.toLowerCase() },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, message: 'Account created successfully' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// ── LOGIN ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, message: 'Logged in successfully' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── ME ──
router.get('/me', authMiddleware, async (req, res) => {
  res.json({
    userId: req.userId,
    email: req.userEmail,
    workspace: req.workspace
  });
});

module.exports = router;
