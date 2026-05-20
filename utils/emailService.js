import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { buildVerificationOtpEmail, buildGenericSecurityEmail } from './emailTemplates.js';

dotenv.config();

const smtpHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.EMAIL_PORT || 587);
const smtpUser = process.env.EMAIL_USER || '';
const smtpPass = process.env.EMAIL_PASS || '';
const smtpFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER || smtpUser;

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
});

const isOtpTemplateRequest = (subject = '', templateName = '') =>
  /otp|verification/i.test(subject) || /otp|verification/i.test(templateName);

export const sendEmail = async ({
  to,
  subject,
  html,
  text,
  template,
  templateData = {}
}) => {
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    
    throw new Error('SMTP email settings not configured');
  }

  let finalHtml = html;

  if (!finalHtml && template) {
    if (template === 'verification-otp' || template === 'login-otp') {
      finalHtml = buildVerificationOtpEmail({
        name: templateData.name,
        otp: templateData.otp,
        purpose: templateData.purpose || (template === 'login-otp' ? 'login' : 'verification'),
        expiresInMinutes: templateData.expiresInMinutes || 10
      });
    } else if (template === 'generic-security') {
      finalHtml = buildGenericSecurityEmail(templateData);
    }
  }

  if (!finalHtml && isOtpTemplateRequest(subject, template)) {
    finalHtml = buildVerificationOtpEmail({
      name: templateData.name,
      otp: templateData.otp,
      purpose: templateData.purpose || 'verification',
      expiresInMinutes: templateData.expiresInMinutes || 10
    });
  }

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html: finalHtml || html
  });
};
