const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });
const BASE_URL = 'https://api.signeasy.com/v3';

const authHeaders = () => ({
  Authorization: `Bearer ${process.env.SIGNEASY_API_TOKEN}`,
});

const removeUploadedFile = async (file) => {
  if (!file?.path) return;

  try {
    await fs.promises.unlink(file.path);
  } catch (err) {
    console.warn('Failed to remove temporary upload:', err.message);
  }
};

// STEP 1: Upload PDF as an original document
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A PDF file is required' });
    }

    console.log('Uploading file to Signeasy:', req.file.originalname);
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    form.append('name', req.file.originalname);
    form.append('rename_if_exists', 'true');

    const response = await axios.post(`${BASE_URL}/original/`, form, {
      headers: { ...authHeaders(), ...form.getHeaders() },
    });

    console.log('File uploaded, document ID:', response.data.id);
    res.json({ documentId: response.data.id, name: req.file.originalname });
  } catch (err) {
    console.error('Upload error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to upload document' });
  } finally {
    await removeUploadedFile(req.file);
  }
});

// Fetch all templates from Signeasy account
router.get('/templates', async (req, res) => {
  try {
    console.log('Fetching templates...');
    const response = await axios.get(`${BASE_URL}/template`, {  // no trailing slash
      headers: authHeaders(),
    });
    console.log('Templates fetched:', Array.isArray(response.data) ? response.data.length : 0);
    res.json({ templates: Array.isArray(response.data) ? response.data : [] });
  } catch (err) {
    console.error('Templates error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// STEP 2A: Send envelope using uploaded original document
router.post('/send', async (req, res) => {
  const { documentId, signerName, signerEmail } = req.body;
  try {
    console.log(`Creating envelope for doc ${documentId}, signer: ${signerEmail}`);
    const response = await axios.post(
      `${BASE_URL}/rs/envelope/`,
      {
        name: 'Signature Request',
        sources: [{ source_id: 1, type: 'original', id: Number(documentId) }],
        is_ordered: 0,
        embedded_signing: false,
        recipients: [{
          recipient_id: 1,
          first_name: signerName.split(' ')[0],
          last_name: signerName.split(' ')[1] || '',
          email: signerEmail,
        }],
        message: 'Please sign this document',
      },
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
    );
    console.log('Envelope created, request ID:', response.data.id);
    res.json({ requestId: response.data.id });
  } catch (err) {
    console.error('Send error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send for signature' });
  }
});

// STEP 2B: Send envelope using a template
router.post('/send-template', async (req, res) => {
  const { templateId, signerName, signerEmail } = req.body;
  try {
    console.log(`Creating envelope from template ${templateId}, signer: ${signerEmail}`);
    const response = await axios.post(
      `${BASE_URL}/rs/envelope/`,
      {
        name: 'Signature Request (Template)',
        sources: [{ source_id: 1, type: 'template', id: Number(templateId) }],
        is_ordered: 0,
        embedded_signing: false,
        recipients: [{
          recipient_id: 1,
          first_name: signerName.split(' ')[0],
          last_name: signerName.split(' ')[1] || '',
          email: signerEmail,
        }],
        // Maps recipient_id 1 to role_id 1, which matches the demo template setup.
        recipient_role_mapping: [{
          role_id: 1,
          recipient_id: 1,
          source_id: 1,
        }],
        message: 'Please sign this document',
      },
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
    );
    console.log('Template envelope created, request ID:', response.data.id);
    res.json({ requestId: response.data.id });
  } catch (err) {
    console.error('Send template error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send template for signature' });
  }
});

// STEP 3: Get status of a signature request
router.get('/status/:id', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/rs/${req.params.id}/`, {
      headers: authHeaders(),
    });
    const status = response.data.status;
    console.log(`Status for ${req.params.id}:`, status);
    res.json({ status });
  } catch (err) {
    console.error('Status error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// STEP 4: Download signed document
router.get('/download/:id', async (req, res) => {
  try {
    console.log('Downloading signed document:', req.params.id);
    const response = await axios.get(`${BASE_URL}/rs/${req.params.id}/download/`, {
      headers: authHeaders(),
      responseType: 'stream',
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="signed-document.pdf"');
    response.data.pipe(res);
  } catch (err) {
    console.error('Download error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

module.exports = router;
