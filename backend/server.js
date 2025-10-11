require('dotenv').config();
const virustotalRoutes = require('./routes/virustotalRoutes');
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');


const app = express();
connectDB();

app.use(cors());
app.use(express.json({ extended: false }));

app.use('/auth', require('./routes/auth'));
app.use('/api/vt', virustotalRoutes);


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend server started on port ${PORT}`));

