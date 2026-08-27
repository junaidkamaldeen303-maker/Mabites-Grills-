const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./models/User');

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mabites');

        // Check if admin exists
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            console.log('✅ Admin already exists');
            console.log(`📧 Email: ${existingAdmin.email}`);
            console.log('🔑 Use your password to login');
            console.log('⚠️  If you forgot your password, run: npm run update-password');
            process.exit(0);
        }

        // Create admin from .env
        const adminPassword = process.env.ADMIN_PASSWORD || 'MabiteAdmin2026!';
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@mabites.com';

        const admin = new User({
            email: adminEmail,
            password: adminPassword,
            name: 'System Admin',
            role: 'admin',
            isActive: true,
        });

        await admin.save();
        console.log('✅ Admin created successfully!');
        console.log(`📧 Email: ${adminEmail}`);
        console.log(`🔑 Password: ${adminPassword}`);
        console.log('⚠️  Please change your password after first login!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error);
        process.exit(1);
    }
};

createAdmin();