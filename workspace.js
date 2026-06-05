const router = require('express').Router();
const multer = require('multer');
const supabase = require('../services/supabase');
const authMiddleware = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── GET WORKSPACE ──
router.get('/', authMiddleware, (req, res) => {
  res.json({ workspace: req.workspace });
});

// ── UPDATE WORKSPACE ──
router.put('/update', authMiddleware, async (req, res) => {
  try {
    const { agency_name, brand_color, tagline } = req.body;
    const updates = {};
    if (agency_name) updates.agency_name = agency_name.trim();
    if (brand_color) updates.brand_color = brand_color;
    if (tagline !== undefined) updates.tagline = tagline;

    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', req.workspace.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ workspace: data });
  } catch (err) {
    console.error('Update workspace error:', err);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

// ── UPLOAD LOGO ──
router.post('/logo', authMiddleware, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPG, PNG, WebP or SVG allowed' });
    }

    const ext = req.file.originalname.split('.').pop();
    const path = `logos/${req.workspace.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(process.env.STORAGE_BUCKET)
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from(process.env.STORAGE_BUCKET)
      .getPublicUrl(path);

    const { data, error } = await supabase
      .from('workspaces')
      .update({ logo_url: publicUrl })
      .eq('id', req.workspace.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ logo_url: publicUrl, workspace: data });
  } catch (err) {
    console.error('Logo upload error:', err);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

module.exports = router;
