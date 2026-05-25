# Signeasy eSignature Demo

A simple web app to upload a PDF, send it for signature via Signeasy,
track signature status, and download the signed document.

## Prerequisites

- Node.js 18+
- A Signeasy API token — get one at https://signeasy.com/developers

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/signeasy-demo.git
cd signeasy-demo

# Add your API token
cp .env.example .env
# Open .env and fill in your SIGNEASY_API_TOKEN

# Start backend
cd server
npm install
npm run dev

# In a new terminal, start frontend
cd client
npm install
npm run dev
```

Open http://localhost:5173

## Architecture

The Express backend exists to keep the Signeasy API token server-side.
The frontend never talks to Signeasy directly — all API calls go
through /api routes on the Express server. Vite proxies /api calls
to localhost:3001 to avoid CORS issues.

## API Endpoints

| Method | Endpoint          | Description              |
| ------ | ----------------- | ------------------------ |
| POST   | /api/upload       | Upload PDF to Signeasy   |
| POST   | /api/send         | Create signature request |
| GET    | /api/status/:id   | Get request status       |
| GET    | /api/download/:id | Download signed PDF      |

## Assumptions

- Single signer per document
- No persistent storage — state lives in React

## Known Limitations

- No authentication on the Express server
- State is lost on page refresh
