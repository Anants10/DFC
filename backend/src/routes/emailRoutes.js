'use strict';
const { Router }  = require('express');
const { emailStatus, sendEmailReport } = require('../controllers/emailController');
const r = Router();

r.get('/status', emailStatus);
r.post('/send',  sendEmailReport);

module.exports = r;
