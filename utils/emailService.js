import sgMail from '@sendgrid/mail';

const sendgridKey = process.env.SENDGRID_API_KEY;
if (sendgridKey) {
  sgMail.setApiKey(sendgridKey);
}

export const sendEmail = async ({ to, subject, html, text }) => {
  if (!sendgridKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('SendGrid API key not configured. Email skipped.');
      return;
    }
    throw new Error('SendGrid API key not configured');
  }

  const from = process.env.SENDGRID_FROM_EMAIL || 'no-reply@freelancepro.com';

  await sgMail.send({
    to,
    from,
    subject,
    text,
    html
  });
};
