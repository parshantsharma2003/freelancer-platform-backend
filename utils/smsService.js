import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

export const sendSms = async ({ to, body }) => {
  if (!twilioClient) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Twilio not configured. SMS skipped.');
      return;
    }
    throw new Error('Twilio not configured');
  }

  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error('Twilio from number not configured');
  }

  await twilioClient.messages.create({ to, from, body });
};
