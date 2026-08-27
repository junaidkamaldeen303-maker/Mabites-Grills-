const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

const User = require('./models/User');

const manualFix = async () => {
    try {
        console.log('🔐 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mabites');
        console.log('✅ Connected to MongoDB');

        const adminEmail = 'admin@mabites.com';
        const newPassword = 'MabiteAdmin2026!';

        // Hash the password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        console.log('🔑 New hashed password created');

        // Update or create admin
        const result = await User.updateOne(
            { email: adminEmail },
            {
                $set: {
                    password: hashedPassword,
                    isActive: true,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        console.log('📊 Update result:', result);

        // Verify the update
        const admin = await User.findOne({ email: adminEmail });

        if (!admin) {
            console.log('❌ Failed to create/update admin');
            process.exit(1);
        }

        console.log('✅ Admin after update:');
        console.log('📧 Email:', admin.email);
        console.log('👤 Name:', admin.name);
        console.log('🔑 Role:', admin.role);
        console.log('🔒 Password hash:', admin.password);

        // Test the password
        const isMatch = await bcrypt.compare(newPassword, admin.password);
        console.log(`🔍 Password "${newPassword}" matches:`, isMatch ? '✅ YES' : '❌ NO');

        if (isMatch) {
            console.log('\n✅ Admin password fixed successfully!');
            console.log(`📧 Email: ${adminEmail}`);
            console.log(`🔑 Password: ${newPassword}`);
            console.log('\n🚀 You can now login to the dashboard.');
        } else {
            console.log('\n❌ Password verification failed. Please try again.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        console.error('❌ Stack:', error.stack);
        process.exit(1);
    }
};

manualFix();