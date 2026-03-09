import passport from 'passport';
import { generateTokens } from '../utils/jwtUtils.js';
import { logAuditEvent } from '../utils/auditLogger.js';

const oauthScopes = {
  google: ['profile', 'email'],
  github: ['user:email'],
  linkedin: ['r_liteprofile', 'r_emailaddress']
};

export const startOAuth = (req, res, next) => {
  const { provider } = req.params;
  const scope = oauthScopes[provider];

  if (!scope) {
    return res.status(400).json({
      status: 'error',
      message: 'Unsupported OAuth provider'
    });
  }

  if (!passport._strategy(provider)) {
    return res.status(400).json({
      status: 'error',
      message: 'OAuth provider not configured'
    });
  }

  const role = req.query.role;
  const state = role ? JSON.stringify({ role }) : undefined;

  passport.authenticate(provider, {
    scope,
    state,
    session: false
  })(req, res, next);
};

export const handleOAuthCallback = (req, res, next) => {
  const { provider } = req.params;

  passport.authenticate(provider, { session: false }, async (error, user) => {
    if (error) {
      return res.status(401).json({
        status: 'error',
        message: error.message
      });
    }

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'OAuth login failed'
      });
    }

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    user.lastLoginIp = req.ip;
    user.lastLoginUserAgent = req.headers['user-agent'];
    await user.save();

    await logAuditEvent({
      actor: user._id,
      actorRole: user.role,
      action: 'auth.oauth_login',
      targetType: 'User',
      targetId: user._id,
      summary: `OAuth login via ${provider}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    if (process.env.OAUTH_SUCCESS_REDIRECT) {
      const redirectUrl = new URL(process.env.OAUTH_SUCCESS_REDIRECT);
      redirectUrl.searchParams.set('accessToken', accessToken);
      redirectUrl.searchParams.set('refreshToken', refreshToken);
      return res.redirect(redirectUrl.toString());
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          accountStatus: user.accountStatus
        },
        accessToken,
        refreshToken
      }
    });
  })(req, res, next);
};
