const fetch = require('node-fetch');

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail({ to, toName, subject, htmlContent }) {
  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_FROM_EMAIL, name: process.env.BREVO_FROM_NAME },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo error: ${err}`);
  }
  return true;
}

async function sendWelcomeEmail(email, agencyName) {
  return sendEmail({
    to: email,
    toName: agencyName,
    subject: `Welcome to ReportlyAI, ${agencyName}!`,
    htmlContent: `
      <div style="font-family:DM Sans,sans-serif;background:#080808;color:#F0EDE6;padding:40px;max-width:600px;margin:0 auto">
        <div style="font-family:serif;font-size:28px;color:#C9A84C;margin-bottom:24px">ReportlyAI</div>
        <h2 style="font-size:22px;margin-bottom:16px">Welcome, ${agencyName}! 🎉</h2>
        <p style="color:#9A9488;line-height:1.7;margin-bottom:20px">
          You're in. Your first report is on us — completely free.<br/>
          Go generate a stunning client report in under 60 seconds.
        </p>
        <a href="${process.env.FRONTEND_URL}/app" 
           style="display:inline-block;background:#C9A84C;color:#000;padding:14px 32px;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px">
          Create My First Report →
        </a>
        <p style="color:#5a5650;font-size:12px;margin-top:32px">ReportlyAI · Turning data into stories agencies are proud to send.</p>
      </div>
    `
  });
}

async function sendReportEmail({ to, toName, agencyName, clientName, period, pdfUrl }) {
  return sendEmail({
    to,
    toName,
    subject: `${clientName} — Social Media Report · ${period}`,
    htmlContent: `
      <div style="font-family:DM Sans,sans-serif;background:#080808;color:#F0EDE6;padding:40px;max-width:600px;margin:0 auto">
        <div style="font-family:serif;font-size:22px;color:#C9A84C;margin-bottom:24px">${agencyName}</div>
        <h2 style="font-size:20px;margin-bottom:12px">Your Monthly Report is Ready</h2>
        <p style="color:#9A9488;line-height:1.7;margin-bottom:8px">Hi ${toName || clientName},</p>
        <p style="color:#9A9488;line-height:1.7;margin-bottom:24px">
          Please find your social media performance report for <strong style="color:#F0EDE6">${period}</strong> attached below.
        </p>
        <a href="${pdfUrl}" 
           style="display:inline-block;background:#C9A84C;color:#000;padding:14px 32px;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px">
          Download Report PDF →
        </a>
        <p style="color:#5a5650;font-size:12px;margin-top:32px">Prepared by ${agencyName} · Powered by ReportlyAI</p>
      </div>
    `
  });
}

async function sendUpgradeConfirmEmail(email, agencyName, plan) {
  return sendEmail({
    to: email,
    toName: agencyName,
    subject: `You're on the ${plan} plan — ReportlyAI`,
    htmlContent: `
      <div style="font-family:DM Sans,sans-serif;background:#080808;color:#F0EDE6;padding:40px;max-width:600px;margin:0 auto">
        <div style="font-family:serif;font-size:28px;color:#C9A84C;margin-bottom:24px">ReportlyAI</div>
        <h2 style="font-size:22px;margin-bottom:16px">You're all set on ${plan}! ✦</h2>
        <p style="color:#9A9488;line-height:1.7;margin-bottom:20px">
          Payment confirmed. Your ${plan} plan is now active. Start generating unlimited reports with full white-label branding.
        </p>
        <a href="${process.env.FRONTEND_URL}/app" 
           style="display:inline-block;background:#C9A84C;color:#000;padding:14px 32px;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px">
          Go to Dashboard →
        </a>
      </div>
    `
  });
}

module.exports = { sendWelcomeEmail, sendReportEmail, sendUpgradeConfirmEmail };
