import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let app;
let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
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
        email: 'user@example.com',
        password: 'TestPass123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'client'
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.accessToken).toBeTruthy();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'user@example.com',
        password: 'TestPass123!'
      });

    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.accessToken;

    const requestVerify = await request(app)
      .post('/api/auth/request-email-verification')
      .set('Authorization', `Bearer ${accessToken}`)
      .send();

    expect(requestVerify.status).toBe(200);
    const token = requestVerify.body.data.token;

    const verifyRes = await request(app)
      .post('/api/auth/verify-email')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token });

    expect(verifyRes.status).toBe(200);
  });
});
