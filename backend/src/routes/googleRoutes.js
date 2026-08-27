const express = require('express');
const {
    googleAuth,
    googleCallback,
} = require('../controllers/googleController');

const router = express.Router();

/**
 * GET /api/auth/google
 * Start Google OAuth authorization
 */
router.get('/google', googleAuth);

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback', googleCallback);

module.exports = router;