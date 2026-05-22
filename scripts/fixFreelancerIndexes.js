import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const fixIndexes = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const FreelancerProfile = mongoose.connection.collection('freelancerprofiles');
    
    console.log('Dropping old indexes on freelancerprofiles collection...');
    try {
      await FreelancerProfile.dropIndexes();
      console.log('All indexes dropped successfully');
    } catch (error) {
      console.log('No indexes to drop or error dropping:', error.message);
    }

    console.log('✅ Freelancer profile indexes fixed! Restart your backend server to recreate them.');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing indexes:', error);
    process.exit(1);
  }
};

fixIndexes();
