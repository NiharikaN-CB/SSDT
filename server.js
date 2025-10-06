const express = require('express');
const cors = require('cors');
const connectDB = require('./db');
require('dotenv').config();

const app = express();
connectDB();

app.use(cors());
app.use(express.json({ extended: false }));

app.use('/auth', require('./routes/auth'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend server started on port ${PORT}`));