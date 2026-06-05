const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const crypto = require('crypto');
const supabase = require('../services/supabase');
const { sendUpgradeConfirmEmail } = require('../services/email');
const authMiddleware = require('../middleware/auth');

// ── Cashfree config ──
const CF_BASE = process.env.CASHFREE_ENV === 'PROD'
  ? 'https://api.cashfree.com'
  : 'https://sandbox.cashfree.com';

const CF_HEADERS = {
  'x-client-id': process.env.CASHFREE_APP_ID,
  'x-client-secret': process.env.CASHFREE_SECRET_KEY,
  'x-api-version': '2023-08-01',
  'Content-Type': 'application/json'
};

// ── Plan definitions ──
const PLANS = {
  starter: { name: 'Starter', amount: 99900, currency: 'INR', reports_limit: 5 },
  growth:  { name: 'Growth',  amount: 249900, currency: 'INR', reports_limit: 20 },
  pro:     { name: 'Pro',     amount: 499900, currency: 'INR', reports_limit: 999999 }
};

// ── GET PLANS ──
router.get('/plans', (req, res) => {
  res.json({ plans: PLANS });
});

// ── GET BILLING STATUS ──
router.get('/status', authMiddleware, (req, res) => {
  const ws = req.workspace;
  const limit = { free: 1, starter: 5, growth: 20, pro: 'Unlimited' }[ws.plan] || 1;
  res.json({
    plan: ws.plan,
    reports_used: ws.reports_used,
    reports_limit: limit,
    can_generate: ws.plan === 'pro' || ws.reports_used < (limit === 'Unlimited' ? Infinity : limit)
  });
});

// ── CREATE CASHFREE ORDER ──
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    const planDetails = PLANS[plan];
    const orderId = `RA_${uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase()}`;

    // Create order via Cashfree API
    const cfRes = await fetch(`${CF_BASE}/pg/orders`, {
      method: 'POST',
      headers: CF_HEADERS,
      body: JSON.stringify({
        order_id: orderId,
        order_amount: planDetails.amount / 100,
        order_currency: planDetails.currency,
        customer_details: {
          customer_id: req.userId,
          customer_email: req.userEmail,
          customer_name: req.workspace.agency_name,
          customer_phone: '9999999999'
        },
        order_meta: {
          return_url: `${process.env.FRONTEND_URL}/app/billing/verify?order_id={order_id}&plan=${plan}`,
          notify_url: `${process.env.BACKEND_URL}/billing/webhook`
        },
        order_note: `ReportlyAI ${planDetails.name} Plan`
      })
    });

    const cfData = await cfRes.json();
    if (!cfRes.ok) {
      console.error('Cashfree order error:', cfData);
      return res.status(500).json({ error: 'Failed to create payment order' });
    }

    // Store pending order
    await supabase.from('billing_events').insert({
      id: uuidv4(),
      workspace_id: req.workspace.id,
      event_type: 'order_created',
      plan,
      amount: planDetails.amount,
      currency: planDetails.currency,
      payment_id: orderId
    });

    res.json({
      order_id: cfData.order_id,
      payment_session_id: cfData.payment_session_id,
      amount: planDetails.amount / 100,
      plan
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// ── VERIFY PAYMENT (called from frontend after redirect) ──
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { order_id, plan } = req.body;
    if (!order_id || !plan) return res.status(400).json({ error: 'order_id and plan required' });
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    // Fetch order status from Cashfree
    const cfRes = await fetch(`${CF_BASE}/pg/orders/${order_id}`, {
      method: 'GET',
      headers: CF_HEADERS
    });
    const cfData = await cfRes.json();

    if (!cfRes.ok || cfData.order_status !== 'PAID') {
      return res.status(400).json({
        error: 'Payment not confirmed',
        status: cfData.order_status
      });
    }

    const planDetails = PLANS[plan];

    // Upgrade workspace
    const { error } = await supabase
      .from('workspaces')
      .update({
        plan,
        reports_limit: planDetails.reports_limit,
        reports_used: 0, // reset on new plan
        billing_cycle_start: new Date().toISOString(),
        cashfree_order_id: order_id
      })
      .eq('id', req.workspace.id);

    if (error) throw error;

    // Log billing event
    await supabase.from('billing_events').insert({
      id: uuidv4(),
      workspace_id: req.workspace.id,
      event_type: 'subscribed',
      plan,
      amount: planDetails.amount,
      currency: 'INR',
      payment_id: order_id
    });

    // Send confirmation email
    sendUpgradeConfirmEmail(req.userEmail, req.workspace.agency_name, planDetails.name).catch(console.error);

    res.json({ success: true, plan, message: `Upgraded to ${planDetails.name} plan!` });
  } catch (err) {
    console.error('Verify payment error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── CASHFREE WEBHOOK ──
router.post('/webhook', (req, res) => {
  // Acknowledge immediately
  res.status(200).json({ status: 'ok' });

  // Process async
  try {
    const rawBody = [];
    req.on('data', chunk => rawBody.push(chunk));
    req.on('end', async () => {
      const body = Buffer.concat(rawBody).toString();
      const signature = req.headers['x-webhook-signature'];
      const timestamp = req.headers['x-webhook-timestamp'];

      // Verify Cashfree webhook signature
      const signedPayload = timestamp + body;
      const expectedSig = crypto
        .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
        .update(signedPayload)
        .digest('base64');

      if (signature !== expectedSig) {
        console.error('Webhook signature mismatch');
        return;
      }

      const event = JSON.parse(body);
      if (event.data?.order?.order_status === 'PAID') {
        const orderId = event.data.order.order_id;
        // Look up pending billing event to find workspace + plan
        const { data: billingEvent } = await supabase
          .from('billing_events')
          .select('*')
          .eq('payment_id', orderId)
          .eq('event_type', 'order_created')
          .single();

        if (billingEvent) {
          const plan = billingEvent.plan;
          const planDetails = PLANS[plan];
          if (planDetails) {
            await supabase.from('workspaces').update({
              plan,
              reports_limit: planDetails.reports_limit,
              reports_used: 0,
              billing_cycle_start: new Date().toISOString(),
              cashfree_order_id: orderId
            }).eq('id', billingEvent.workspace_id);

            await supabase.from('billing_events').insert({
              id: uuidv4(),
              workspace_id: billingEvent.workspace_id,
              event_type: 'subscribed_via_webhook',
              plan,
              amount: planDetails.amount,
              currency: 'INR',
              payment_id: orderId
            });
          }
        }
      }
    });
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

module.exports = router;
