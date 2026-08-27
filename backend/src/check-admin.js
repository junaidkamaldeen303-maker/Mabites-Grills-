const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./models/User');

const checkAdmin = async () => {
    try {
        console.log('🔐 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mabites');
        console.log('✅ Connected to MongoDB');

        const adminEmail = 'admin@mabites.com';

        // Find the admin user
        const admin = await User.findOne({ email: adminEmail });

        if (!admin) {
            console.log('❌ Admin user NOT found!');
            console.log('📝 Please run: npm run fix-admin');
            process.exit(1);
        }

        console.log('✅ Admin user found!');
        console.log('📧 Email:', admin.email);
        console.log('👤 Name:', admin.name);
        console.log('🔑 Role:', admin.role);
        console.log('🔒 Password hash:', admin.password);
        console.log('📅 Created:', admin.createdAt);
        console.log('📅 Updated:', admin.updatedAt);

        // Test the password manually
        const testPassword = 'MabiteAdmin2026!';
        const isMatch = await bcrypt.compare(testPassword, admin.password);
        console.log(`🔍 Password "${testPassword}" matches:`, isMatch ? '✅ YES' : '❌ NO');

        // Try alternative password
        const altPassword = 'admin123';
        const isMatchAlt = await bcrypt.compare(altPassword, admin.password);
        console.log(`🔍 Password "${altPassword}" matches:`, isMatchAlt ? '✅ YES' : '❌ NO');

        console.log('\n📋 Summary:');
        if (isMatch) {
            console.log('✅ Admin password is correct! You can login with:');
            console.log(`   Email: ${adminEmail}`);
            console.log(`   Password: ${testPassword}`);
        } else if (isMatchAlt) {
            console.log('⚠️  Admin password is still "admin123". Please update it.');
        } else {
            console.log('❌ Admin password does not match any expected value.');
            console.log('📝 Run: npm run manual-fix');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        console.error('❌ Stack:', error.stack);
        process.exit(1);
    }
};

checkAdmin();