const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const authMiddleware = require('../middleware/auth');

// ── LIST CLIENTS ──
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('workspace_id', req.workspace.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ clients: data });
  } catch (err) {
    console.error('List clients error:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// ── CREATE CLIENT ──
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { name, email, industry, platforms } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });

    const { data, error } = await supabase
      .from('clients')
      .insert({
        id: uuidv4(),
        workspace_id: req.workspace.id,
        name: name.trim(),
        email: email || null,
        industry: industry || null,
        platforms: platforms || []
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ client: data });
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// ── UPDATE CLIENT ──
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, email, industry, platforms } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (email !== undefined) updates.email = email;
    if (industry !== undefined) updates.industry = industry;
    if (platforms) updates.platforms = platforms;

    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', req.params.id)
      .eq('workspace_id', req.workspace.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Client not found' });
    res.json({ client: data });
  } catch (err) {
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// ── DELETE CLIENT ──
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', req.params.id)
      .eq('workspace_id', req.workspace.id);

    if (error) throw error;
    res.json({ message: 'Client deleted' });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

module.exports = router;
