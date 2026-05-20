import passport from "passport";
import { generateTokens, hashToken } from "../utils/jwtUtils.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { getAuthCookieOptions } from "../utils/cookieOptions.js";

/*
|--------------------------------------------------------------------------
| OAuth Scopes
|--------------------------------------------------------------------------
*/

const oauthScopes = {
  google: ["profile", "email"],
  github: ["user:email"],
  linkedin: ["r_liteprofile", "r_emailaddress"]
};

const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:5173")
  .replace(/\/+$/, "");

/*
|--------------------------------------------------------------------------
| Start OAuth Flow
|--------------------------------------------------------------------------
*/

export const startOAuth = (req, res, next) => {
  const { provider } = req.params;

  const scope = oauthScopes[provider];

  if (!scope) {
    return res.status(400).json({
      status: "error",
      message: "Unsupported OAuth provider"
    });
  }

  if (!passport._strategy(provider)) {
    return res.status(400).json({
      status: "error",
      message: "OAuth provider not configured"
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

/*
|--------------------------------------------------------------------------
| OAuth Callback
|--------------------------------------------------------------------------
*/

export const handleOAuthCallback = (req, res, next) => {
  const { provider } = req.params;

  passport.authenticate(provider, { session: false }, async (error, user) => {
    if (error) {
      return res.status(401).json({
        status: "error",
        message: error.message
      });
    }

    if (!user) {
      return res.status(401).json({
        status: "error",
        message: "OAuth login failed"
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Generate Tokens
    |--------------------------------------------------------------------------
    */

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);

    /*
    |--------------------------------------------------------------------------
    | Store Hashed Refresh Token
    |--------------------------------------------------------------------------
    */

    user.refreshToken = hashToken(refreshToken);

    user.lastLogin = new Date();
    user.lastLoginIp = req.ip;
    user.lastLoginUserAgent = req.headers["user-agent"];

    await user.save();

    /*
    |--------------------------------------------------------------------------
    | Audit Log
    |--------------------------------------------------------------------------
    */

    await logAuditEvent({
      actor: user._id,
      actorRole: user.role,
      action: "auth.oauth_login",
      targetType: "User",
      targetId: user._id,
      summary: `OAuth login via ${provider}`,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    /*
    |--------------------------------------------------------------------------
    | Send Secure Cookies
    |--------------------------------------------------------------------------
    */

    res.cookie("accessToken", accessToken, getAuthCookieOptions(15 * 60 * 1000));

    res.cookie(
      "refreshToken",
      refreshToken,
      getAuthCookieOptions(7 * 24 * 60 * 60 * 1000)
    );

    /*
    |--------------------------------------------------------------------------
    | Redirect to Frontend
    |--------------------------------------------------------------------------
    */

    const redirectUrl =
      process.env.OAUTH_SUCCESS_REDIRECT || `${frontendBaseUrl}/dashboard`;

    return res.redirect(redirectUrl);
  })(req, res, next);
};