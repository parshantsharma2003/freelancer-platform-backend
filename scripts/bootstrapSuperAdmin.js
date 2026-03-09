import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

/**
 * Bootstrap Super Admin Account
 * 
 * Creates ONE predefined Super Admin user with god-mode privileges.
 * This account:
 * - Has full system access
 * - Can perform ALL CRUD operations
 * - Can override any system decision
 * - Cannot be deleted or downgraded
 * - Is the ONLY super_admin in the system
 * 
 * SECURITY WARNING:
 * - Change the password immediately after first login in production
 * - Store credentials in a secure password manager
 * - Never commit real production credentials to version control
 */

const SUPER_ADMIN_EMAIL = 'admin@platform.com';
const SUPER_ADMIN_PASSWORD = 'StrongAdmin@123'; // Change in production!
const SUPER_ADMIN_FIRST_NAME = 'Super';
const SUPER_ADMIN_LAST_NAME = 'Admin';

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const createSuperAdmin = async () => {
  try {
    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ 
      role: 'super_admin' 
    });

    if (existingSuperAdmin) {
      console.log('✅ Super Admin already exists:');
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log(`   Name: ${existingSuperAdmin.fullName}`);
      console.log(`   Created: ${existingSuperAdmin.createdAt}`);
      return existingSuperAdmin;
    }

    // Check if email is already taken by a different role
    const existingUser = await User.findOne({ 
      email: SUPER_ADMIN_EMAIL 
    });

    if (existingUser) {
      console.log(`⚠️  User with email ${SUPER_ADMIN_EMAIL} already exists but is not super_admin`);
      console.log(`   Current role: ${existingUser.role}`);
      console.log('   To create super admin, either:');
      console.log('   1. Delete this user first, or');
      console.log('   2. Use a different email in this script');
      return null;
    }

    // Create super admin
    const superAdmin = await User.create({
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      firstName: SUPER_ADMIN_FIRST_NAME,
      lastName: SUPER_ADMIN_LAST_NAME,
      role: 'super_admin',
      accountStatus: 'active',
      isActive: true,
      emailVerified: true,
      isVerified: true,
      phoneVerified: false
    });

    console.log('\n🎉 Super Admin created successfully!\n');
    console.log('='.repeat(60));
    console.log('SUPER ADMIN CREDENTIALS (KEEP SECURE):');
    console.log('='.repeat(60));
    console.log(`Email:    ${SUPER_ADMIN_EMAIL}`);
    console.log(`Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log(`ID:       ${superAdmin._id}`);
    console.log(`Created:  ${superAdmin.createdAt}`);
    console.log('='.repeat(60));
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('1. Change the password immediately after first login');
    console.log('2. Store credentials in a secure password manager');
    console.log('3. Never share super admin credentials');
    console.log('4. Enable 2FA if available');
    console.log('5. Audit super admin actions regularly\n');

    return superAdmin;

  } catch (error) {
    console.error('❌ Error creating Super Admin:', error.message);
    throw error;
  }
};

const verifySuperAdminUniqueness = async () => {
  try {
    const superAdmins = await User.find({ role: 'super_admin' });
    
    if (superAdmins.length > 1) {
      console.log('\n⚠️  WARNING: Multiple super admins detected!');
      console.log(`   Found ${superAdmins.length} super admin accounts:`);
      superAdmins.forEach((admin, index) => {
        console.log(`   ${index + 1}. ${admin.email} (ID: ${admin._id})`);
      });
      console.log('\n   This violates the ONE super admin rule.');
      console.log('   Please review and remove duplicate accounts.\n');
    } else if (superAdmins.length === 1) {
      console.log('✅ Super Admin uniqueness verified: 1 account');
    } else {
      console.log('⚠️  No super admin accounts found');
    }
  } catch (error) {
    console.error('❌ Error verifying super admin uniqueness:', error.message);
  }
};

const bootstrap = async () => {
  try {
    console.log('\n🚀 Starting Super Admin Bootstrap...\n');

    await connectDB();
    await createSuperAdmin();
    await verifySuperAdminUniqueness();

    console.log('\n✅ Bootstrap completed successfully\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Bootstrap failed:', error.message);
    process.exit(1);
  }
};

// Run bootstrap
bootstrap();
