const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const { generateReportAI } = require('../services/ai');
const { generatePDF, uploadPDF } = require('../services/pdf');
const { sendReportEmail } = require('../services/email');
const authMiddleware = require('../middleware/auth');

// ── PLAN LIMITS ──
const PLAN_LIMITS = { free: 1, starter: 5, growth: 20, pro: Infinity };

function canGenerateReport(workspace) {
  const limit = PLAN_LIMITS[workspace.plan] || 1;
  return workspace.reports_used < limit;
}

// ── LIST REPORTS ──
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*, clients(name, industry)')
      .eq('workspace_id', req.workspace.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ reports: data });
  } catch (err) {
    console.error('List reports error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ── GET SINGLE REPORT ──
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reports')
      .select('*, clients(*)')
      .eq('id', req.params.id)
      .eq('workspace_id', req.workspace.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Report not found' });
    res.json({ report: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// ── CREATE REPORT (main endpoint) ──
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const workspace = req.workspace;

    // ── Check plan limit ──
    if (!canGenerateReport(workspace)) {
      return res.status(402).json({
        error: 'Report limit reached',
        plan: workspace.plan,
        used: workspace.reports_used,
        limit: PLAN_LIMITS[workspace.plan],
        upgrade_required: true
      });
    }

    const { client_id, period_start, period_end, platforms_data, notes, template } = req.body;
    if (!client_id || !period_start || !period_end || !platforms_data) {
      return res.status(400).json({ error: 'client_id, period_start, period_end, and platforms_data are required' });
    }

    // Fetch client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .eq('workspace_id', workspace.id)
      .single();

    if (clientError || !client) return res.status(404).json({ error: 'Client not found' });

    // Create report record as "generating"
    const reportId = uuidv4();
    const { error: insertError } = await supabase.from('reports').insert({
      id: reportId,
      workspace_id: workspace.id,
      client_id,
      period_start,
      period_end,
      template: template || 'dark_luxury',
      raw_data: platforms_data,
      notes: notes || null,
      status: 'generating'
    });
    if (insertError) throw insertError;

    // ── Generate AI commentary ──
    let aiOutput;
    try {
      aiOutput = await generateReportAI({
        client,
        period_start,
        period_end,
        agency_name: workspace.agency_name,
        platforms_data,
        notes
      });
    } catch (aiErr) {
      console.error('AI generation error:', aiErr);
      await supabase.from('reports').update({ status: 'failed' }).eq('id', reportId);
      return res.status(500).json({ error: 'AI generation failed. Please try again.' });
    }

    // ── Generate PDF ──
    let pdfUrl = null;
    try {
      const pdfBuffer = await generatePDF(
        { id: reportId, period_start, period_end },
        workspace,
        client,
        aiOutput
      );
      pdfUrl = await uploadPDF(pdfBuffer, reportId, workspace.id);
    } catch (pdfErr) {
      console.error('PDF generation error:', pdfErr);
      // Don't fail the request — save AI output even if PDF fails
    }

    // ── Update report with AI output + PDF URL ──
    const { data: updatedReport, error: updateError } = await supabase
      .from('reports')
      .update({
        ai_output: aiOutput,
        pdf_url: pdfUrl,
        status: 'ready'
      })
      .eq('id', reportId)
      .select()
      .single();

    if (updateError) throw updateError;

    // ── Increment usage count ──
    await supabase
      .from('workspaces')
      .update({ reports_used: workspace.reports_used + 1 })
      .eq('id', workspace.id);

    res.status(201).json({ report: { ...updatedReport, client } });
  } catch (err) {
    console.error('Create report error:', err);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// ── SEND REPORT TO CLIENT ──
router.post('/:id/send', authMiddleware, async (req, res) => {
  try {
    const { email, client_name } = req.body;
    if (!email) return res.status(400).json({ error: 'Recipient email is required' });

    const { data: report, error } = await supabase
      .from('reports')
      .select('*, clients(*)')
      .eq('id', req.params.id)
      .eq('workspace_id', req.workspace.id)
      .single();

    if (error || !report) return res.status(404).json({ error: 'Report not found' });
    if (!report.pdf_url) return res.status(400).json({ error: 'PDF not ready yet' });

    await sendReportEmail({
      to: email,
      toName: client_name || report.clients?.name,
      agencyName: req.workspace.agency_name,
      clientName: report.clients?.name,
      period: `${report.period_start} – ${report.period_end}`,
      pdfUrl: report.pdf_url
    });

    // Log the send
    await supabase.from('report_sends').insert({
      id: uuidv4(),
      report_id: report.id,
      sent_to_email: email
    });

    // Update report status
    await supabase.from('reports').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', report.id);

    res.json({ message: 'Report sent successfully' });
  } catch (err) {
    console.error('Send report error:', err);
    res.status(500).json({ error: 'Failed to send report' });
  }
});

// ── DELETE REPORT ──
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from('reports')
      .delete()
      .eq('id', req.params.id)
      .eq('workspace_id', req.workspace.id);

    if (error) throw error;
    res.json({ message: 'Report deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

module.exports = router;
