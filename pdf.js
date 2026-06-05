const puppeteer = require('puppeteer');
const supabase = require('./supabase');

function buildReportHTML(report, workspace, client, aiOutput) {
  const brandColor = workspace.brand_color || '#C9A84C';
  const agencyName = workspace.agency_name || 'Agency';
  const logoUrl = workspace.logo_url || '';
  const isPaidPlan = workspace.plan !== 'free';

  const platformIcons = {
    instagram: '📸', youtube: '▶️', facebook: '👥',
    linkedin: '💼', twitter: '🐦', meta_ads: '📢'
  };

  const gradeColors = {
    'A+': '#4CAF82', 'A': '#4CAF82', 'B+': '#C9A84C',
    'B': '#C9A84C', 'C': '#E08052', 'Needs Work': '#E05252'
  };

  const platformHighlightsHTML = (aiOutput.platform_highlights || []).map(p => `
    <div class="platform-card">
      <div class="platform-header">
        <span class="platform-icon">${platformIcons[p.platform?.toLowerCase()] || '📊'}</span>
        <span class="platform-name">${p.platform}</span>
        <span class="trend-badge trend-${p.trend}">${p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : '→'} ${p.trend}</span>
      </div>
      <div class="platform-metric">${p.key_metric}</div>
      <div class="platform-summary">${p.summary}</div>
    </div>
  `).join('');

  const listItems = (arr) => (arr || []).map(item => `<li>${item}</li>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'DM Sans',sans-serif;background:#080808;color:#F0EDE6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:794px;min-height:1123px;padding:60px;background:#080808;position:relative}
  .page+.page{border-top:1px solid rgba(255,255,255,0.05);margin-top:0}

  /* Cover */
  .cover{background:linear-gradient(135deg,#0a0a0a 0%,#111 50%,#0d0d0d 100%);min-height:1123px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
  .cover::before{content:'';position:absolute;top:-100px;right:-100px;width:500px;height:500px;border-radius:50%;border:1px solid rgba(201,168,76,0.08);pointer-events:none}
  .cover::after{content:'';position:absolute;top:-60px;right:-60px;width:300px;height:300px;border-radius:50%;border:1px solid rgba(201,168,76,0.05);pointer-events:none}

  .cover-header{display:flex;justify-content:space-between;align-items:center}
  .agency-logo{height:48px;max-width:200px;object-fit:contain}
  .agency-name-text{font-family:'Cormorant Garamond',serif;font-size:20px;color:#F0EDE6;font-weight:600}
  .cover-main{flex:1;display:flex;flex-direction:column;justify-content:center;padding:60px 0}
  .cover-label{font-size:11px;color:${brandColor};letter-spacing:0.16em;text-transform:uppercase;margin-bottom:20px}
  .cover-title{font-family:'Cormorant Garamond',serif;font-size:64px;font-weight:700;line-height:1.05;color:#F0EDE6;margin-bottom:12px}
  .cover-client{font-size:20px;color:rgba(240,237,230,0.5);font-weight:300;margin-bottom:40px}
  .cover-period{display:inline-block;border:1px solid rgba(201,168,76,0.3);border-radius:6px;padding:8px 20px;font-size:13px;color:${brandColor};letter-spacing:0.06em}
  .grade-badge{position:absolute;top:50%;right:60px;transform:translateY(-50%);width:96px;height:96px;border-radius:50%;border:2px solid ${gradeColors[aiOutput.performance_grade] || '#C9A84C'};display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(8,8,8,0.8)}
  .grade-value{font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:700;color:${gradeColors[aiOutput.performance_grade] || '#C9A84C'};line-height:1}
  .grade-label{font-size:9px;color:#9A9488;letter-spacing:0.1em;text-transform:uppercase;margin-top:2px}
  .cover-footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:24px}
  .cover-footer-text{font-size:12px;color:#5a5650}
  .watermark{font-size:11px;color:#2a2a2a}

  /* Content pages */
  .section{margin-bottom:40px}
  .section-label{font-size:10px;color:${brandColor};text-transform:uppercase;letter-spacing:0.14em;margin-bottom:8px;display:flex;align-items:center;gap:8px}
  .section-label::before{content:'';display:block;width:16px;height:1px;background:${brandColor}}
  .section-title{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600;margin-bottom:20px}

  /* AI Summary */
  .ai-box{background:rgba(201,168,76,0.04);border:1px solid rgba(201,168,76,0.2);border-radius:10px;padding:28px}
  .ai-headline{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:${brandColor};margin-bottom:14px}
  .ai-text{font-size:14px;color:#C8C4BC;line-height:1.8}

  /* Platform cards */
  .platforms-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
  .platform-card{background:#111;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:22px}
  .platform-header{display:flex;align-items:center;gap:8px;margin-bottom:12px}
  .platform-icon{font-size:18px}
  .platform-name{font-size:14px;font-weight:600;flex:1}
  .trend-badge{font-size:10px;padding:3px 10px;border-radius:100px;font-weight:500}
  .trend-up{background:rgba(76,175,130,0.12);color:#4CAF82}
  .trend-down{background:rgba(224,82,82,0.12);color:#E05252}
  .trend-stable{background:rgba(154,148,136,0.12);color:#9A9488}
  .platform-metric{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:600;color:${brandColor};margin-bottom:8px}
  .platform-summary{font-size:13px;color:#9A9488;line-height:1.6}

  /* Lists */
  .insight-list{display:flex;flex-direction:column;gap:12px}
  .insight-item{display:flex;align-items:flex-start;gap:12px;padding:16px;background:#111;border-radius:8px;border:1px solid rgba(255,255,255,0.05)}
  .insight-icon{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;margin-top:1px}
  .icon-green{background:rgba(76,175,130,0.15);color:#4CAF82}
  .icon-gold{background:rgba(201,168,76,0.15);color:${brandColor}}
  .icon-blue{background:rgba(100,150,255,0.15);color:#6496FF}
  .insight-text{font-size:13px;color:#C8C4BC;line-height:1.6}

  /* Goals */
  .goals-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}
  .goal-card{background:#111;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:20px;text-align:center}
  .goal-num{font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:700;color:${brandColor};line-height:1;margin-bottom:10px}
  .goal-text{font-size:12px;color:#9A9488;line-height:1.6}

  /* Closing */
  .closing-box{background:linear-gradient(135deg,rgba(201,168,76,0.06),transparent);border:1px solid rgba(201,168,76,0.15);border-radius:12px;padding:32px;text-align:center;margin-top:40px}
  .closing-text{font-family:'Cormorant Garamond',serif;font-size:18px;color:#F0EDE6;line-height:1.7;font-style:italic}
  .closing-sig{font-size:13px;color:#5a5650;margin-top:16px}

  /* Page header for inner pages */
  .inner-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:24px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:36px}
  .inner-agency{font-size:13px;color:#5a5650}
  .inner-client{font-family:'Cormorant Garamond',serif;font-size:16px;color:#9A9488}
</style>
</head>
<body>

<!-- PAGE 1: COVER -->
<div class="page cover">
  <div class="cover-header">
    ${logoUrl && isPaidPlan ? `<img src="${logoUrl}" class="agency-logo" alt="${agencyName}"/>` : `<span class="agency-name-text">${agencyName}</span>`}
    <span style="font-size:12px;color:#5a5650;letter-spacing:0.06em">MONTHLY PERFORMANCE REPORT</span>
  </div>

  <div class="cover-main">
    <div class="cover-label">Social Media Performance</div>
    <div class="cover-title">${client.name}</div>
    <div class="cover-client">${client.industry || 'Social Media Report'}</div>
    <div class="cover-period">${report.period_start} — ${report.period_end}</div>

    <div class="grade-badge">
      <span class="grade-value">${aiOutput.performance_grade}</span>
      <span class="grade-label">Grade</span>
    </div>
  </div>

  <div class="cover-footer">
    <span class="cover-footer-text">Prepared by ${agencyName} · ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
    ${!isPaidPlan ? `<span class="watermark">Generated with ReportlyAI</span>` : ''}
  </div>
</div>

<!-- PAGE 2: EXECUTIVE SUMMARY + PLATFORMS -->
<div class="page">
  <div class="inner-header">
    <span class="inner-agency">${agencyName}</span>
    <span class="inner-client">${client.name} · Performance Report</span>
  </div>

  <div class="section">
    <div class="section-label">Executive Summary</div>
    <div class="ai-box">
      <div class="ai-headline">${aiOutput.headline}</div>
      <div class="ai-text">${aiOutput.executive_summary}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-label">Platform Performance</div>
    <div class="section-title">Channel Breakdown</div>
    <div class="platforms-grid">${platformHighlightsHTML}</div>
  </div>
</div>

<!-- PAGE 3: INSIGHTS + GOALS -->
<div class="page">
  <div class="inner-header">
    <span class="inner-agency">${agencyName}</span>
    <span class="inner-client">${client.name} · Performance Report</span>
  </div>

  <div class="section">
    <div class="section-label">What Worked</div>
    <div class="section-title">Wins This Month</div>
    <div class="insight-list">
      ${(aiOutput.what_worked || []).map((w, i) => `
        <div class="insight-item">
          <div class="insight-icon icon-green">✓</div>
          <div class="insight-text">${w}</div>
        </div>`).join('')}
    </div>
  </div>

  <div class="section" style="margin-top:32px">
    <div class="section-label">Opportunities</div>
    <div class="section-title">Areas to Improve</div>
    <div class="insight-list">
      ${(aiOutput.what_to_improve || []).map((w, i) => `
        <div class="insight-item">
          <div class="insight-icon icon-gold">↗</div>
          <div class="insight-text">${w}</div>
        </div>`).join('')}
    </div>
  </div>

  <div class="section" style="margin-top:32px">
    <div class="section-label">Looking Ahead</div>
    <div class="section-title">Goals for Next Month</div>
    <div class="goals-grid">
      ${(aiOutput.next_month_goals || []).slice(0,3).map((g, i) => `
        <div class="goal-card">
          <div class="goal-num">0${i+1}</div>
          <div class="goal-text">${g}</div>
        </div>`).join('')}
    </div>
  </div>

  <div class="closing-box">
    <div class="closing-text">"${aiOutput.closing_note}"</div>
    <div class="closing-sig">— ${agencyName} Team</div>
  </div>
</div>

</body>
</html>`;
}

async function generatePDF(report, workspace, client, aiOutput) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    const html = buildReportHTML(report, workspace, client, aiOutput);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      width: '794px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    return pdfBuffer;
  } finally {
    if (browser) await browser.close();
  }
}

async function uploadPDF(pdfBuffer, reportId, workspaceId) {
  const path = `reports/${workspaceId}/${reportId}.pdf`;
  const { error } = await supabase.storage
    .from(process.env.STORAGE_BUCKET)
    .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;

  // Signed URL valid for 1 year
  const { data } = await supabase.storage
    .from(process.env.STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  return data.signedUrl;
}

module.exports = { generatePDF, uploadPDF };
