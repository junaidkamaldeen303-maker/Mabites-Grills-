const express = require('express');
const router = express.Router();
const {
    login,
    logout,
    getMe,
    registerAdmin,
    changePassword,
    refreshToken,
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/auth');

// Public routes
router.post('/login', login);
router.post('/register', registerAdmin);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/change-password', protect, changePassword);
router.post('/refresh', refreshToken);

module.exports = router;