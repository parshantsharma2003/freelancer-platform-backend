import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const fixIndexes = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const Job = mongoose.connection.collection('jobs');
    
    console.log('Dropping old indexes...');
    try {
      await Job.dropIndexes();
      console.log('All indexes dropped successfully');
    } catch (error) {
      console.log('No indexes to drop or error dropping:', error.message);
    }

    console.log('Indexes fixed! Restart your backend server to recreate them.');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing indexes:', error);
    process.exit(1);
  }
};

fixIndexes();
