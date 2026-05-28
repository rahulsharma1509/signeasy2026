import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'signeasy_history';

const loadHistory = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
};

const saveHistory = (history) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
};

const STATUS_COLOR = {
  incomplete: 'bg-yellow-100 text-yellow-800',
  viewed:     'bg-blue-100 text-blue-800',
  complete:   'bg-green-100 text-green-800',
  completed:  'bg-green-100 text-green-800',
  signed:     'bg-green-100 text-green-800',
};

// Signeasy returns "complete" (not "completed") — handle both for safety
const isDownloadReady = (status) =>
  status === 'complete' || status === 'completed' || status === 'signed';

export default function App() {
  const [mode, setMode]                   = useState('upload');
  const [file, setFile]                   = useState(null);
  const [documentId, setDocumentId]       = useState(null);
  const [documentName, setDocumentName]   = useState('');
  const [templates, setTemplates]         = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [signerName, setSignerName]       = useState('');
  const [signerEmail, setSignerEmail]     = useState('');
  const [requestId, setRequestId]         = useState(null);
  const [status, setStatus]               = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [history, setHistory]             = useState(loadHistory);
  const [showHistory, setShowHistory]     = useState(false);

  const intervalRef = useRef(null);

  // Fetch templates once on mount
  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {});
  }, []);

  // Poll status every 30 seconds when a request is active
  useEffect(() => {
    if (!requestId) return;

    const poll = async () => {
      try {
        const res  = await fetch(`/api/status/${requestId}`);
        const data = await res.json();
        if (!data.status) return;

        setStatus(data.status);
        setStatusHistory((prev) => {
          if (prev[prev.length - 1]?.status === data.status) return prev;
          const next = [...prev, { status: data.status, time: new Date().toLocaleTimeString() }];
          // Keep history record in sync
          setHistory((h) => {
            const updated = h.map((item) =>
              item.requestId === requestId ? { ...item, status: data.status } : item
            );
            saveHistory(updated);
            return updated;
          });
          return next;
        });
      } catch {
        // silent — polling failure shouldn't surface as an error
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 30000);
    return () => clearInterval(intervalRef.current);
  }, [requestId]);

  // --- Handlers ---

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res  = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDocumentId(data.documentId);
      setDocumentName(data.name);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!signerName || !signerEmail) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'template' ? '/api/send-template' : '/api/send';
      const body     = mode === 'template'
        ? { templateId: selectedTemplate, signerName, signerEmail }
        : { documentId, signerName, signerEmail };

      const res  = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setRequestId(data.requestId);
      setStatus('incomplete');
      setStatusHistory([{ status: 'incomplete', time: new Date().toLocaleTimeString() }]);

      const templateName = templates.find((t) => String(t.id) === String(selectedTemplate))?.name || '';
      const entry = {
        requestId:    data.requestId,
        documentName: mode === 'template' ? `Template: ${templateName}` : documentName,
        signerName,
        signerEmail,
        status:       'incomplete',
        sentAt:       new Date().toLocaleString(),
      };
      setHistory((h) => {
        const updated = [entry, ...h];
        saveHistory(updated);
        return updated;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id = requestId) => {
    if (!id) return;
    // Open in new tab — browser will trigger the PDF download
    window.open(`/api/download/${id}`, '_blank');
  };

  const handleLoadFromHistory = (entry) => {
    setRequestId(entry.requestId);
    setStatus(entry.status);
    setSignerName(entry.signerName);
    setSignerEmail(entry.signerEmail);
    setDocumentName(entry.documentName);
    setStatusHistory([{ status: entry.status, time: entry.sentAt }]);
    setShowHistory(false);
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const resetForm = () => {
    clearInterval(intervalRef.current);
    setFile(null);
    setDocumentId(null);
    setDocumentName('');
    setSelectedTemplate('');
    setSignerName('');
    setSignerEmail('');
    setRequestId(null);
    setStatus(null);
    setStatusHistory([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">📄 Signeasy Demo</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded"
            >
              📋 History ({history.length})
            </button>
            {requestId && (
              <button onClick={resetForm} className="text-sm bg-gray-200 hover:bg-gray-300 px-3 py-1 rounded">
                + New
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div>}

        {/* History Panel */}
        {showHistory && (
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-lg">📋 Request History</h2>
              <button onClick={handleClearHistory} className="text-xs text-red-500 hover:underline">
                Clear all
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">No history yet.</p>
            ) : (
              history.map((entry, i) => (
                <div key={i} className="border rounded p-3 space-y-1">
                  <p className="text-sm font-medium">{entry.documentName}</p>
                  <p className="text-xs text-gray-500">To: {entry.signerName} ({entry.signerEmail})</p>
                  <p className="text-xs text-gray-400">Sent: {entry.sentAt}</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[entry.status] || 'bg-gray-100 text-gray-600'}`}>
                      {entry.status}
                    </span>
                    <div className="flex items-center gap-3">
                      {isDownloadReady(entry.status) && (
                        <button
                          onClick={() => handleDownload(entry.requestId)}
                          className="text-xs text-green-600 hover:underline"
                        >
                          ⬇️ Download
                        </button>
                      )}
                      <button
                        onClick={() => handleLoadFromHistory(entry)}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Track →
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* MODE SELECTOR — only before a request is active */}
        {!requestId && (
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <h2 className="font-semibold text-lg">Choose Document Type</h2>
            <div className="flex gap-3">
              <button
                onClick={() => { setMode('upload'); resetForm(); }}
                className={`flex-1 py-2 rounded border text-sm font-medium ${mode === 'upload' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300'}`}
              >
                📤 Upload PDF
              </button>
              <button
                onClick={() => { setMode('template'); resetForm(); }}
                className={`flex-1 py-2 rounded border text-sm font-medium ${mode === 'template' ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-300'}`}
              >
                📋 Use Template
              </button>
            </div>
          </div>
        )}

        {/* STEP 1A — Upload PDF */}
        {mode === 'upload' && !requestId && (
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <h2 className="font-semibold text-lg">Step 1 — Upload Document</h2>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files[0])}
              className="block w-full text-sm text-gray-500"
            />
            <button
              onClick={handleUpload}
              disabled={!file || loading || !!documentId}
              className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading && !documentId ? 'Uploading...' : 'Upload'}
            </button>
            {documentId && (
              <p className="text-green-600 text-sm">✅ Uploaded: {documentName} (ID: {documentId})</p>
            )}
          </div>
        )}

        {/* STEP 1B — Select Template */}
        {mode === 'template' && !requestId && (
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <h2 className="font-semibold text-lg">Step 1 — Select Template</h2>
            {templates.length === 0 ? (
              <p className="text-sm text-gray-400">No templates found. Create one at signeasy.com first.</p>
            ) : (
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="border rounded w-full px-3 py-2 text-sm"
              >
                <option value="">-- Select a template --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* STEP 2 — Add Signer */}
        {(documentId || selectedTemplate) && !requestId && (
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <h2 className="font-semibold text-lg">Step 2 — Add Signer</h2>
            <input
              type="text"
              placeholder="Signer name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="border rounded w-full px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="Signer email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              className="border rounded w-full px-3 py-2 text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!signerName || !signerEmail || loading}
              className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send for Signature'}
            </button>
          </div>
        )}

        {/* STEP 3 — Track Status */}
        {requestId && (
          <div className="bg-white rounded-xl shadow p-5 space-y-3">
            <h2 className="font-semibold text-lg">Step 3 — Track Status</h2>
            <p className="text-sm text-gray-500">
              Document: <span className="font-medium">{documentName || 'Template'}</span>
            </p>
            <p className="text-sm text-gray-500">
              Sent to: <span className="font-medium">{signerName} ({signerEmail})</span>
            </p>
            {status && (
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLOR[status] || 'bg-gray-100 text-gray-600'}`}>
                {status.toUpperCase()}
              </span>
            )}
            <div className="mt-2 space-y-1">
              {statusHistory.map((entry, i) => (
                <p key={i} className="text-xs text-gray-500">{entry.time} — {entry.status}</p>
              ))}
            </div>
            <p className="text-xs text-gray-400">Auto-refreshes every 30 seconds</p>

            {isDownloadReady(status) ? (
              <button
                onClick={() => handleDownload()}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium"
              >
                ⬇️ Download Signed Document
              </button>
            ) : (
              <p className="text-xs text-gray-400 italic">
                Download will appear once signing is complete.
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
