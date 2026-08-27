const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./models/User');

const fixAdmin = async () => {
    try {
        console.log('🔐 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mabites');
        console.log('✅ Connected to MongoDB');

        const adminEmail = process.env.ADMIN_EMAIL || 'admin@mabites.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'MabiteAdmin2026!';

        console.log(`📧 Admin Email: ${adminEmail}`);
        console.log(`🔑 Admin Password: ${adminPassword}`);

        // Check if admin exists
        const existingAdmin = await User.findOne({ email: adminEmail });

        if (existingAdmin) {
            // Update password
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            existingAdmin.password = hashedPassword;
            existingAdmin.isActive = true;
            await existingAdmin.save();
            console.log('✅ Admin password updated successfully!');
            console.log(`📧 Email: ${adminEmail}`);
            console.log(`🔑 New Password: ${adminPassword}`);
        } else {
            // Create new admin
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
        }

        console.log('\n⚠️  Please use these credentials to login:');
        console.log(`   Email: ${adminEmail}`);
        console.log(`   Password: ${adminPassword}`);
        console.log('\n🚀 You can now login to the dashboard.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        console.error('❌ Stack:', error.stack);
        process.exit(1);
    }
};

fixAdmin();