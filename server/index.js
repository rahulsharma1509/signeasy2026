require('dotenv').config();
const express = require('express');
const cors = require('cors');
const signeasyRoutes = require('./routes/signeasy');

const app = express();
const PORT = process.env.PORT || 3002;

if (!process.env.SIGNEASY_API_TOKEN) {
  console.error('Missing SIGNEASY_API_TOKEN. Add it to server/.env before starting the server.');
  process.exit(1);
}

app.use(cors());
app.use(express.json());

app.use('/api', signeasyRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
