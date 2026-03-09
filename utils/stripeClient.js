import Stripe from 'stripe';

/**
 * Build mock Stripe client ONLY for automated testing
 * NEVER use this in development or production
 */
const buildMockStripe = () => ({
  paymentIntents: {
    create: async () => ({
      id: 'pi_test_123',
      status: 'requires_payment_method',
      client_secret: 'pi_test_secret',
      latest_charge: 'ch_test_123'
    })
  },
  transfers: {
    create: async () => ({ id: 'tr_test_123' })
  },
  accounts: {
    create: async () => ({
      id: 'acct_test_123',
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false
    }),
    retrieve: async () => ({
      id: 'acct_test_123',
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true
    }),
    createLoginLink: async () => ({ url: 'https://connect.stripe.com/express/test' })
  },
  accountLinks: {
    create: async () => ({ url: 'https://connect.stripe.com/setup/s/test' })
  },
  webhooks: {
    constructEvent: (payload) => {
      const body = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
      return typeof body === 'string' ? JSON.parse(body) : body;
    }
  }
});

// IMPORTANT: Only use mock Stripe for automated tests (NODE_ENV=test with STRIPE_MOCK=true)
// In development and production, always use real Stripe with test keys for dev, live keys for prod
const stripe = (process.env.NODE_ENV === 'test' && process.env.STRIPE_MOCK === 'true')
  ? buildMockStripe()
  : new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

export default stripe;
