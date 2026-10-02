'use strict';
require('dotenv').config();
require('express-async-errors');

const express  = require('express');
const cors     = require('cors');
const morgan   = require('morgan');
const mongoose = require('mongoose');

const { connectDB }    = require('./config/database');
const eventRoutes      = require('./routes/eventRoutes');
const mlRoutes         = require('./routes/mlRoutes');
const emailRoutes      = require('./routes/emailRoutes');
const errorHandler     = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

app.use('/api/events', eventRoutes);
app.use('/api/email',  emailRoutes);
app.use('/api/ml',     mlRoutes);
app.get('/api/health', (req, res) => res.json({
  ok: true,
  service: 'DFCCIL Express API',
  mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
}));
app.use(errorHandler);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log('🚀 Express API  →  http://localhost:' + PORT);
    console.log('   ML Server    →  ' + process.env.ML_SERVER);
    console.log('   MongoDB      →  ' + process.env.MONGO_URI);
    console.log('   No seed data — clean database for real detections only.');
  });
});
