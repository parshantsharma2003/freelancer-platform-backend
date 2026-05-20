const baseCardStyle = 'max-width:640px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 20px 60px rgba(15,23,42,0.12);font-family:Arial,Helvetica,sans-serif;color:#0f172a;';

const badgeStyle = 'display:inline-block;padding:8px 14px;border-radius:999px;background:#ecfeff;color:#0f766e;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;';
const ctaStyle = 'display:inline-block;padding:14px 22px;border-radius:14px;background:linear-gradient(135deg,#0f766e,#14b8a6);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;';

const shell = ({ title, subtitle, body, ctaText, ctaUrl, highlight }) => `
  <div style="background:linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%);padding:40px 16px;">
    <div style="${baseCardStyle}">
      <div style="background:linear-gradient(135deg,#0f172a 0%,#0f766e 100%);padding:28px 32px;color:#fff;">
        <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85;font-weight:700;">FreelancePro</div>
        <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;">${title}</h1>
        <p style="margin:10px 0 0;font-size:15px;line-height:1.6;opacity:0.92;">${subtitle}</p>
      </div>

      <div style="padding:32px;">
        ${highlight ? `<div style="${badgeStyle}">${highlight}</div>` : ''}
        <div style="font-size:16px;line-height:1.75;color:#334155;margin-top:${highlight ? '18px' : '0'};">${body}</div>

        ${ctaUrl && ctaText ? `
          <div style="margin:28px 0 20px;">
            <a href="${ctaUrl}" style="${ctaStyle}">${ctaText}</a>
          </div>
          <div style="font-size:12px;color:#64748b;line-height:1.6;word-break:break-all;">If the button does not work, copy and paste this link:<br><a href="${ctaUrl}" style="color:#0f766e;">${ctaUrl}</a></div>
        ` : ''}
      </div>
    </div>
  </div>
`;

export const buildVerificationOtpEmail = ({ name = 'there', otp, purpose = 'verification', expiresInMinutes = 10 }) => {
  const title = purpose === 'login' ? 'Your login code' : 'Verify your account';
  const subtitle = purpose === 'login'
    ? 'Use this one-time code to finish signing in.'
    : 'Use this one-time code to verify your email address and activate your account.';

  const body = `
    <p style="margin:0 0 16px;">Hello <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">Your verification code is:</p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;min-width:240px;padding:18px 24px;border-radius:18px;background:#f8fafc;border:1px dashed #0f766e;font-size:36px;font-weight:800;letter-spacing:10px;color:#0f172a;">${otp}</div>
    </div>
    <p style="margin:0 0 12px;">This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
    <p style="margin:0;">If you did not request this code, you can safely ignore this email.</p>
  `;

  return shell({
    title,
    subtitle,
    body,
    highlight: purpose === 'login' ? 'Secure sign-in' : 'Account verification'
  });
};

export const buildGenericSecurityEmail = ({ name = 'there', title, subtitle, body, ctaText, ctaUrl, highlight }) => shell({
  title,
  subtitle,
  body: `
    <p style="margin:0 0 16px;">Hello <strong>${name}</strong>,</p>
    ${body}
  `,
  ctaText,
  ctaUrl,
  highlight
});
