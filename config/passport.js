import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as LinkedInStrategy } from "passport-linkedin-oauth2";
import User from "../models/User.js";

/*
|--------------------------------------------------------------------------
| Extract Role From OAuth State
|--------------------------------------------------------------------------
*/

const getRoleFromState = (state) => {
  if (!state) return "client";

  try {
    const parsed = JSON.parse(state);
    return ["client", "freelancer"].includes(parsed.role)
      ? parsed.role
      : "client";
  } catch (error) {
    try {
      const parsed = JSON.parse(decodeURIComponent(state));
      return ["client", "freelancer"].includes(parsed.role)
        ? parsed.role
        : "client";
    } catch {
      return "client";
    }
  }
};

/*
|--------------------------------------------------------------------------
| Extract Names From Profile
|--------------------------------------------------------------------------
*/

const getNamesFromProfile = (profile) => {
  const display = profile.displayName || "";
  const parts = display.split(" ").filter(Boolean);

  const firstName = profile.name?.givenName || parts[0] || "User";
  const lastName = profile.name?.familyName || parts.slice(1).join(" ") || "";

  return { firstName, lastName };
};

/*
|--------------------------------------------------------------------------
| Extract Email
|--------------------------------------------------------------------------
*/

const getEmailFromProfile = (profile) => {
  return profile.emails?.[0]?.value || null;
};

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

/*
|--------------------------------------------------------------------------
| Secure OAuth User Creation
|--------------------------------------------------------------------------
*/

const findOrCreateOAuthUser = async (req, provider, profile) => {
  const providerUserId = profile.id;
  const rawEmail = getEmailFromProfile(profile);
  const email = normalizeEmail(rawEmail);

  if (!email) {
    throw new Error("OAuth provider did not return an email");
  }

  /*
  |--------------------------------------------------------------------------
  | Check if OAuth provider already linked
  |--------------------------------------------------------------------------
  */

  let user = await User.findOne({
    "oauthProviders.provider": provider,
    "oauthProviders.providerUserId": providerUserId
  });

  /*
  |--------------------------------------------------------------------------
  | Prevent OAuth Account Hijacking
  |--------------------------------------------------------------------------
  */

  if (!user && email) {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      const alreadyLinked = existingUser.oauthProviders?.some(
        (p) => p.provider === provider
      );

      if (!alreadyLinked) {
        throw new Error(
          "An account already exists with this email. Please login first and link this OAuth provider from account settings."
        );
      }

      user = existingUser;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Create New User
  |--------------------------------------------------------------------------
  */

  if (!user) {
    const role = getRoleFromState(req.query.state);
    const { firstName, lastName } = getNamesFromProfile(profile);

    try {
      user = await User.create({
        email,
        firstName,
        lastName,
        role,
        accountStatus: "active",
        emailVerified: true,
        isVerified: true,
        oauthProviders: [
          {
            provider,
            providerUserId,
            email
          }
        ]
      });
    } catch (createError) {
      // Handle race conditions where another callback created the same account.
      if (createError?.code === 11000) {
        user = await User.findOne({
          $or: [
            { email },
            {
              "oauthProviders.provider": provider,
              "oauthProviders.providerUserId": providerUserId
            }
          ]
        });
      }

      if (!user) {
        throw createError;
      }
    }

    return user;
  }

  /*
  |--------------------------------------------------------------------------
  | Link Provider If Not Linked
  |--------------------------------------------------------------------------
  */

  if (!user.oauthProviders) {
    user.oauthProviders = [];
  }

  const isLinked = user.oauthProviders.some(
    (entry) =>
      entry.provider === provider &&
      entry.providerUserId === providerUserId
  );

  if (!isLinked) {
    user.oauthProviders.push({
      provider,
      providerUserId,
      email
    });
  }

  user.emailVerified = true;
  user.isVerified = true;

  if (user.accountStatus === "pending_verification") {
    user.accountStatus = "active";
  }

  await user.save();

  return user;
};

/*
|--------------------------------------------------------------------------
| Passport Configuration
|--------------------------------------------------------------------------
*/

export const configurePassport = () => {
  const baseUrl = (process.env.BACKEND_URL || "http://localhost:5001").replace(
    /\/+$/,
    ""
  );

  const getCallbackUrl = (provider) => {
    const envKey = `OAUTH_${provider.toUpperCase()}_CALLBACK_URL`;
    return (
      process.env[envKey] ||
      `${baseUrl}/api/auth/oauth/${provider}/callback`
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Google OAuth
  |--------------------------------------------------------------------------
  */

  if (
    process.env.OAUTH_GOOGLE_CLIENT_ID &&
    process.env.OAUTH_GOOGLE_CLIENT_SECRET
  ) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.OAUTH_GOOGLE_CLIENT_ID,
          clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET,
          callbackURL: getCallbackUrl("google"),
          passReqToCallback: true
        },
        async (req, accessToken, refreshToken, profile, done) => {
          try {
            const user = await findOrCreateOAuthUser(
              req,
              "google",
              profile
            );
            done(null, user);
          } catch (error) {
            done(error, null);
          }
        }
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | GitHub OAuth
  |--------------------------------------------------------------------------
  */

  if (
    process.env.OAUTH_GITHUB_CLIENT_ID &&
    process.env.OAUTH_GITHUB_CLIENT_SECRET
  ) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.OAUTH_GITHUB_CLIENT_ID,
          clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET,
          callbackURL: getCallbackUrl("github"),
          passReqToCallback: true,
          scope: ["user:email"]
        },
        async (req, accessToken, refreshToken, profile, done) => {
          try {
            const user = await findOrCreateOAuthUser(
              req,
              "github",
              profile
            );
            done(null, user);
          } catch (error) {
            done(error, null);
          }
        }
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | LinkedIn OAuth
  |--------------------------------------------------------------------------
  */

  if (
    process.env.OAUTH_LINKEDIN_CLIENT_ID &&
    process.env.OAUTH_LINKEDIN_CLIENT_SECRET
  ) {
    passport.use(
      new LinkedInStrategy(
        {
          clientID: process.env.OAUTH_LINKEDIN_CLIENT_ID,
          clientSecret: process.env.OAUTH_LINKEDIN_CLIENT_SECRET,
          callbackURL: getCallbackUrl("linkedin"),
          scope: ["r_liteprofile", "r_emailaddress"],
          passReqToCallback: true
        },
        async (req, accessToken, refreshToken, profile, done) => {
          try {
            const user = await findOrCreateOAuthUser(
              req,
              "linkedin",
              profile
            );
            done(null, user);
          } catch (error) {
            done(error, null);
          }
        }
      )
    );
  }
};
