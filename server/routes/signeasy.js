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

const logError = (label, err) => {
  console.error(`[${label}]`, err.response?.status ?? 500, err.response?.data?.message || err.message);
};

const removeUploadedFile = async (file) => {
  if (!file?.path) return;
  try {
    await fs.promises.unlink(file.path);
  } catch {
    // ignore — temp file cleanup failure is non-critical
  }
};

// On Signeasy the envelope ID == signed file ID (confirmed from API response).
// Just check status first, then use the same ID for download.
const resolveSignedFileId = async (requestId) => {
  const { data } = await axios.get(`${BASE_URL}/rs/${requestId}/`, {
    headers: authHeaders(),
  });
  const done = ["complete", "completed", "signed"];
  return done.includes(data.status) ? requestId : null;
};

// STEP 1: Upload PDF as an original document
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });

    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    form.append('name', req.file.originalname);
    form.append('rename_if_exists', 'true');

    const { data } = await axios.post(`${BASE_URL}/original/`, form, {
      headers: { ...authHeaders(), ...form.getHeaders() },
    });

    res.json({ documentId: data.id, name: req.file.originalname });
  } catch (err) {
    logError('upload', err);
    res.status(500).json({ error: 'Failed to upload document' });
  } finally {
    await removeUploadedFile(req.file);
  }
});

// Fetch all templates from Signeasy account
router.get('/templates', async (req, res) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/template`, { headers: authHeaders() });
    res.json({ templates: Array.isArray(data) ? data : [] });
  } catch (err) {
    logError('templates', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// STEP 2A: Send envelope using uploaded original document
router.post('/send', async (req, res) => {
  const { documentId, signerName, signerEmail } = req.body;
  try {
    const { data } = await axios.post(
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
    res.json({ requestId: data.id });
  } catch (err) {
    logError('send', err);
    res.status(500).json({ error: 'Failed to send for signature' });
  }
});

// STEP 2B: Send envelope using a template
router.post('/send-template', async (req, res) => {
  const { templateId, signerName, signerEmail } = req.body;
  try {
    const { data } = await axios.post(
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
        recipient_role_mapping: [{ role_id: 1, recipient_id: 1, source_id: 1 }],
        message: 'Please sign this document',
      },
      { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
    );
    res.json({ requestId: data.id });
  } catch (err) {
    logError('send-template', err);
    res.status(500).json({ error: 'Failed to send template for signature' });
  }
});

// DEBUG: Inspect raw Signeasy envelope response (remove before production)
router.get('/debug/:id', async (req, res) => {
  try {
    const { data: envelope } = await axios.get(`${BASE_URL}/rs/${req.params.id}/`, {
      headers: authHeaders(),
    });
    const { data: signedList } = await axios.get(`${BASE_URL}/rs/envelope/signed/`, {
      headers: authHeaders(),
    });
    res.json({ envelope, signedList });
  } catch (err) {
    logError('debug', err);
    res.status(500).json({ error: err.message });
  }
});

// STEP 3: Get status of a signature request
router.get('/status/:id', async (req, res) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/rs/${req.params.id}/`, {
      headers: authHeaders(),
    });
    res.json({ status: data.status });
  } catch (err) {
    logError('status', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// STEP 4: Download signed document
// requestId is the envelope/request ID — we resolve the signed file ID from it.
router.get('/download/:id', async (req, res) => {
  const requestId = req.params.id;
  try {
    const signedFileId = await resolveSignedFileId(requestId);

    if (!signedFileId) {
      return res.status(409).json({ error: 'Signed document is not ready yet. Please wait for the signer to complete.' });
    }

    const response = await axios.get(`${BASE_URL}/signed/${signedFileId}/download`, {
      headers: authHeaders(),
      params: { type: 'split', include_certificate: true },
      responseType: 'stream',
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      response.headers['content-disposition'] || `attachment; filename="signed-${requestId}.pdf"`
    );
    response.data.pipe(res);
  } catch (err) {
    logError('download', err);
    const status = err.response?.status;
    if (status === 404 || status === 400) {
      return res.status(409).json({ error: 'Signed document is not ready yet.' });
    }
    res.status(500).json({ error: 'Failed to download document' });
  }
});

module.exports = router;
