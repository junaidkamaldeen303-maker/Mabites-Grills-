const oauth2Client = require('../config/googleOAuth');
const { google } = require('googleapis');

/**
 * GET /api/auth/google
 * Start Google OAuth authorization
 */
const googleAuth = (req, res) => {
    try {
        const scopes = [
            'https://www.googleapis.com/auth/business.manage',
        ];

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent',
        });

        console.log('🔐 Redirecting to Google OAuth...');

        return res.redirect(authUrl);
    } catch (error) {
        console.error('❌ Google OAuth start error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to start Google authorization',
        });
    }
};

/**
 * GET /api/auth/google/callback
 * Google redirects here after authorization
 */
const googleCallback = async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Authorization code not provided',
            });
        }

        console.log('🔐 Google authorization code received');

        const { tokens } = await oauth2Client.getToken(code);

        console.log('✅ Google OAuth successful');
        console.log('🔑 Access token received:', !!tokens.access_token);
        console.log('🔄 Refresh token received:', !!tokens.refresh_token);

        if (!tokens.access_token) {
            console.error('❌ No Google access token was returned');

            return res.status(401).json({
                success: false,
                message: 'Google did not return an access token',
            });
        }

        // Set the newly received credentials on the OAuth client
        oauth2Client.setCredentials(tokens);

        console.log('🔐 Google OAuth credentials set');

        // Create Google Business Profile Account Management client
        const businessAccountManagement =
            google.mybusinessaccountmanagement({
                version: 'v1',
                auth: oauth2Client,
            });

        console.log('📋 Fetching Google Business Profile accounts...');

        // Get all accounts accessible to the authorized Google account
        const response =
            await businessAccountManagement.accounts.list({
                pageSize: 20,
            });

        const accounts = response.data.accounts || [];

        console.log(`📋 Google accounts found: ${accounts.length}`);

        if (accounts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No Google Business Profile accounts found',
            });
        }

        console.log('✅ Google Business Profile accounts retrieved');

        return res.status(200).json({
            success: true,
            message: 'Google authorization and account lookup successful',
            accounts: accounts.map(account => ({
                name: account.name,
                accountName: account.accountName,
                type: account.type,
                role: account.role,
            })),
            hasAccessToken: !!tokens.access_token,
            hasRefreshToken: !!tokens.refresh_token,
        });
    } catch (error) {
        console.error('❌ Google OAuth callback error:', error);

        if (error.response?.data) {
            console.error(
                '❌ Google API error:',
                JSON.stringify(error.response.data, null, 2)
            );
        }

        return res.status(500).json({
            success: false,
            message: 'Google authorization or account lookup failed',
        });
    }
};

module.exports = {
    googleAuth,
    googleCallback,
};