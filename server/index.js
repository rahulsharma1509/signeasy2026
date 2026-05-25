require('dotenv').config();
const express = require('express');
const cors = require('cors');
const signeasyRoutes = require('./routes/signeasy');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.use('/api', signeasyRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});