import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let app;
let mongo;

const registerAndLogin = async (role, email) => {
  const registerRes = await request(app)
    .post('/api/auth/register')
    .send({
      fullName: role === 'client' ? 'Client User' : 'Freelancer User',
      email,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
      role
    });

  const verificationToken = registerRes.body?.data?.verificationToken;

  if (verificationToken) {
    await request(app)
      .get(`/api/auth/verify-email/${verificationToken}`)
      .send();
  }

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'TestPass123!' });

  return loginRes.body.data.accessToken;
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access';
  process.env.JWT_REFRESH_SECRET = 'test_refresh';
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_MOCK = 'true';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

  const module = await import('../server.js');
  app = module.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongo.stop();
});

describe('Payments E2E', () => {
  it('creates escrow payment and releases to connect payout', async () => {
    const clientToken = await registerAndLogin('client', 'client@example.com');
    const freelancerToken = await registerAndLogin('freelancer', 'freelancer@example.com');

    await request(app)
      .post('/api/payments/connect/account')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send();

    await request(app)
      .get('/api/payments/connect/status')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send();

    const jobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        title: 'Test job',
        description: 'Test job description',
        category: 'Design',
        skills: ['Figma'],
        budget: { type: 'fixed', amount: 500 },
        duration: '1-2-weeks',
        experienceLevel: 'intermediate'
      });

    const jobId = jobRes.body.data.job._id;

    const freelancerProfile = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send();

    const freelancerId = freelancerProfile.body.data.user._id;

    const contractRes = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        job: jobId,
        freelancer: freelancerId,
        title: 'Test contract',
        budget: { amount: 500, type: 'fixed', currency: 'USD' }
      });

    const contractId = contractRes.body.data.contract._id;

    await request(app)
      .post(`/api/contracts/${contractId}/accept`)
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send();

    const milestonesRes = await request(app)
      .post('/api/milestones')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        contractId,
        milestones: [
          {
            title: 'Milestone 1',
            description: 'First delivery phase',
            amount: 500,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          }
        ]
      });

    expect(milestonesRes.status).toBe(201);
    const milestoneId = milestonesRes.body.data.milestones[0]._id;

    const paymentRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        contractId,
        milestoneId,
        amount: 500,
        type: 'deposit'
      });

    const paymentId = paymentRes.body.data.payment._id;
    const paymentIntentId = paymentRes.body.data.payment.stripe.paymentIntentId;

    const webhookPayload = JSON.stringify({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: paymentIntentId,
          status: 'succeeded',
          latest_charge: 'ch_test_123'
        }
      }
    });

    await request(app)
      .post('/api/payments/webhook')
      .set('stripe-signature', 'test')
      .set('Content-Type', 'application/json')
      .send(webhookPayload);

    const startWorkRes = await request(app)
      .post(`/api/milestones/${milestoneId}/start-work`)
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send();

    expect(startWorkRes.status).toBe(200);

    const submitRes = await request(app)
      .post(`/api/milestones/${milestoneId}/submit`)
      .set('Authorization', `Bearer ${freelancerToken}`)
      .send({
        description: 'Milestone work submission for review'
      });

    expect(submitRes.status).toBe(200);

    const approveRes = await request(app)
      .post(`/api/milestones/${milestoneId}/approve`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        feedback: 'Looks good'
      });

    expect(approveRes.status).toBe(200);

    const releaseRes = await request(app)
      .post(`/api/payments/${paymentId}/release`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send();

    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.data.payment.status).toBe('completed');
  });
});
