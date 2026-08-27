const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./models/User');

const updatePassword = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mabites');

        const newPassword = process.env.ADMIN_PASSWORD || 'MabiteAdmin2026!';
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        const result = await User.updateOne(
            { email: process.env.ADMIN_EMAIL || 'admin@mabites.com' },
            { $set: { password: hashedPassword } }
        );

        if (result.matchedCount > 0) {
            console.log(`✅ Password updated for admin`);
            console.log(`📧 Email: ${process.env.ADMIN_EMAIL || 'admin@mabites.com'}`);
            console.log(`🔑 New Password: ${newPassword}`);
            console.log(`⚠️  Please use this password to login`);
        } else {
            console.log('❌ Admin user not found. Please run npm run seed first.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating password:', error);
        process.exit(1);
    }
};

updatePassword();