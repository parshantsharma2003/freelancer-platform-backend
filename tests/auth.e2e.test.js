import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let app;
let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access';
  process.env.JWT_REFRESH_SECRET = 'test_refresh';
  process.env.NODE_ENV = 'test';
  process.env.STRIPE_MOCK = 'true';

  const module = await import('../server.js');
  app = module.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  await mongo.stop();
});

describe('Auth E2E', () => {
  it('registers, logs in, and verifies email', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        fullName: 'Test User',
        email: 'user@example.com',
        password: 'TestPass123!',
        confirmPassword: 'TestPass123!',
        role: 'client'
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.requiresEmailVerification).toBe(true);

    const token = registerRes.body.data.verificationToken;
    expect(token).toBeTruthy();

    const verifyPublicRes = await request(app)
      .get(`/api/auth/verify-email/${token}`)
      .send();

    expect(verifyPublicRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'TestPass123!'
      });

    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.accessToken;
    expect(accessToken).toBeTruthy();

    const requestVerify = await request(app)
      .post('/api/auth/request-email-verification')
      .set('Authorization', `Bearer ${accessToken}`)
      .send();

    expect(requestVerify.status).toBe(200);
    expect(requestVerify.body.message).toMatch(/already verified/i);
  });
});
