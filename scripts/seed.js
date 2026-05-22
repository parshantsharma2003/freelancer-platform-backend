import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';
import FreelancerProfile from '../models/FreelancerProfile.js';
import ClientProfile from '../models/ClientProfile.js';
import Job from '../models/Job.js';
import Contract from '../models/Contract.js';

dotenv.config();

const connect = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }
  await mongoose.connect(process.env.MONGO_URI);
};

const createAdmin = async () => {
  const existing = await User.findOne({ email: 'admin@freelancepro.com' });
  if (existing) return existing;

  return User.create({
    email: 'admin@freelancepro.com',
    password: 'AdminPass123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    accountStatus: 'active',
    emailVerified: true,
    isVerified: true
  });
};

const createSampleData = async () => {
  const clientEmail = 'client@freelancepro.com';
  const freelancerEmail = 'freelancer@freelancepro.com';

  let client = await User.findOne({ email: clientEmail });
  if (!client) {
    client = await User.create({
      email: clientEmail,
      password: 'ClientPass123!',
      firstName: 'Alex',
      lastName: 'Client',
      role: 'client',
      accountStatus: 'active',
      emailVerified: true,
      isVerified: true
    });
  }

  let freelancer = await User.findOne({ email: freelancerEmail });
  if (!freelancer) {
    freelancer = await User.create({
      email: freelancerEmail,
      password: 'FreelancerPass123!',
      firstName: 'Jamie',
      lastName: 'Freelancer',
      role: 'freelancer',
      accountStatus: 'active',
      emailVerified: true,
      isVerified: true
    });
  }

  await ClientProfile.findOneAndUpdate(
    { user: client._id },
    {
      user: client._id,
      companyName: 'Northwind Labs',
      industry: 'SaaS',
      description: 'Building modern B2B tools.'
    },
    { upsert: true, new: true }
  );

  await FreelancerProfile.findOneAndUpdate(
    { user: freelancer._id },
    {
      user: freelancer._id,
      title: 'Product Designer',
      description: 'Designing high-converting UX for startups.',
      hourlyRate: 45,
      skills: ['Figma', 'UX Research', 'Design Systems'],
      profileCompleteness: 80
    },
    { upsert: true, new: true }
  );

  let job = await Job.findOne({ client: client._id, title: 'Landing page redesign' });
  if (!job) {
    job = await Job.create({
      client: client._id,
      title: 'Landing page redesign',
      description: 'Need a bold, modern landing page for a SaaS product.',
      category: 'Design & Creative',
      skills: ['Figma', 'Web Design'],
      budget: {
        type: 'fixed',
        amount: 800,
        currency: 'USD'
      },
      duration: '1-2-weeks',
      experienceLevel: 'intermediate',
      status: 'open'
    });
  }

  const existingContract = await Contract.findOne({ job: job._id });
  if (!existingContract) {
    await Contract.create({
      job: job._id,
      client: client._id,
      freelancer: freelancer._id,
      title: 'Landing page redesign',
      budget: {
        amount: 800,
        type: 'fixed',
        currency: 'USD'
      }
    });
  }
};

const run = async () => {
  const shouldSeedSample = process.argv.includes('--sample');
  try {
    await connect();
    await createAdmin();
    if (shouldSeedSample) {
      await createSampleData();
    }
    console.log('Seed completed.');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();
