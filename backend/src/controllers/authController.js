const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Staff = require('../models/Staff');
/**
 * Generate JWT token
 */
const generateToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );
};

/**
 * Set HttpOnly cookie with token
 */
const setTokenCookie = (res, token) => {
    console.log('🍪 Setting cookie...');

    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/'
    });
    console.log('🍪 Cookie set!');
};

/**
 * POST /api/auth/login
 * Handles both Admin and Staff login
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log('🔐 Login attempt:', { email, password: '***' });

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password',
            });
        }

        // First, check if it's an Admin/Manager (User model)
        let user = await User.findOne({ email: email.toLowerCase() });
        let isStaff = false;

        // If not found in User model, check Staff model
        if (!user) {
            const staff = await Staff.findOne({ email: email.toLowerCase() });

            if (staff) {
                // Check if staff is active
                if (!staff.isActive) {
                    console.log('❌ Staff account deactivated');
                    return res.status(401).json({
                        success: false,
                        message: 'Account deactivated. Contact admin.',
                    });
                }

                const isPasswordValid = await staff.comparePassword(password);
                if (!isPasswordValid) {
                    console.log('❌ Invalid staff password');
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid credentials',
                    });
                }

                // Staff login successful
                user = staff;
                isStaff = true;
                console.log(`✅ Staff logged in: ${user.email} (${user.role})`);
            }
        } else {
            // Admin login
            const isPasswordValid = await user.comparePassword(password);
            if (!isPasswordValid) {
                console.log('❌ Invalid admin password');
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials',
                });
            }

            if (!user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'Account deactivated. Contact admin.',
                });
            }

            console.log(`✅ Admin logged in: ${user.email} (${user.role})`);
        }

        if (!user) {
            console.log('❌ User not found');
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id);
        setTokenCookie(res, token);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isStaff: isStaff,
                },
            },
        });
    } catch (error) {
        console.error('❌ Login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.',
        });
    }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
    try {
        res.clearCookie('token', {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
        });

        console.log('🔐 User logged out');
        return res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        console.error('❌ Logout error:', error);
        return res.status(500).json({
            success: false,
            message: 'Logout failed',
        });
    }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        return res.status(200).json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    lastLogin: user.lastLogin,
                },
            },
        });
    } catch (error) {
        console.error('❌ GetMe error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get user info',
        });
    }
};

/**
 * POST /api/auth/register
 */
const registerAdmin = async (req, res) => {
    try {
        const { email, password, name } = req.body;

        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Admin already exists. Please login.',
            });
        }

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email, password, and name',
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters',
            });
        }

        const user = new User({
            email: email.toLowerCase(),
            password,
            name,
            role: 'admin',
            isActive: true,
        });

        await user.save();

        console.log(`🔐 Admin registered: ${user.email}`);

        return res.status(201).json({
            success: true,
            message: 'Admin registered successfully. Please login.',
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists',
            });
        }
        console.error('❌ Register error:', error);
        return res.status(500).json({
            success: false,
            message: 'Registration failed',
        });
    }
};

/**
 * POST /api/auth/change-password
 */
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide current and new password',
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters',
            });
        }

        const user = await User.findById(req.user.id).select('+password');
        const isMatch = await user.comparePassword(currentPassword);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect',
            });
        }

        user.password = newPassword;
        await user.save();

        console.log(`🔐 Password changed for: ${user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Password changed successfully',
        });
    } catch (error) {
        console.error('❌ Change password error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to change password',
        });
    }
};

/**
 * POST /api/auth/refresh
 */
const refreshToken = async (req, res) => {
    try {
        const token = req.cookies?.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided',
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found',
            });
        }

        const newToken = generateToken(user._id);
        setTokenCookie(res, newToken);

        return res.status(200).json({
            success: true,
            message: 'Token refreshed',
        });
    } catch (error) {
        console.error('❌ Refresh token error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
        });
    }
};
/**
 * GET /api/auth/google
 * Start Google OAuth authorization
 */
const googleAuth = (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/business.manage',
        ],
    });

    res.redirect(authUrl);
};
module.exports = {
    login,
    logout,
    getMe,
    registerAdmin,
    changePassword,
    refreshToken,
};