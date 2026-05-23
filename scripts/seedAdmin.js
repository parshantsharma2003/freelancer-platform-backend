import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "freelancer-platform";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@platform.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "StrongAdmin@123";
const ADMIN_FIRST_NAME = process.env.SEED_ADMIN_FIRST_NAME || "Super";
const ADMIN_LAST_NAME = process.env.SEED_ADMIN_LAST_NAME || "Admin";

const seedAdmin = async () => {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is required");
  }

  await mongoose.connect(MONGO_URI, { dbName: DB_NAME });
  console.log("✅ Connected to MongoDB Atlas");

  const users = mongoose.connection.collection("users");
  const existingUser = await users.findOne({ email: ADMIN_EMAIL });

  if (existingUser) {
    console.log(`ℹ️  Admin already exists: ${ADMIN_EMAIL}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const now = new Date();

  const result = await users.insertOne({
    email: ADMIN_EMAIL,
    password: hashedPassword,
    firstName: ADMIN_FIRST_NAME,
    lastName: ADMIN_LAST_NAME,
    role: "super_admin",
    accountStatus: "active",
    isActive: true,
    emailVerified: true,
    isVerified: true,
    phoneVerified: false,
    oauthProviders: [],
    createdAt: now,
    updatedAt: now
  });

  console.log("🎉 Super admin created");
  console.log(`   Email: ${ADMIN_EMAIL}`);
  console.log(`   ID: ${result.insertedId}`);
};

seedAdmin()
  .catch((error) => {
    console.error("❌ Failed to seed admin:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });