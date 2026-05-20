import jwt from "jsonwebtoken";
import crypto from "crypto";

/*
|--------------------------------------------------------------------------
| Token Hashing (For Refresh Tokens)
|--------------------------------------------------------------------------
*/

export const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/*
|--------------------------------------------------------------------------
| Generate Access Token
|--------------------------------------------------------------------------
*/

export const generateAccessToken = (userId, role) => {
  return jwt.sign(
    {
      sub: userId,
      role,
      type: "access"
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m"
    }
  );
};

/*
|--------------------------------------------------------------------------
| Generate Refresh Token
|--------------------------------------------------------------------------
*/

export const generateRefreshToken = (userId) => {
  return jwt.sign(
    {
      sub: userId,
      type: "refresh"
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d"
    }
  );
};

/*
|--------------------------------------------------------------------------
| Verify Access Token
|--------------------------------------------------------------------------
*/

export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (error) {
    throw new Error("Invalid or expired access token");
  }
};

/*
|--------------------------------------------------------------------------
| Verify Refresh Token
|--------------------------------------------------------------------------
*/

export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }
};

/*
|--------------------------------------------------------------------------
| Generate Both Tokens
|--------------------------------------------------------------------------
*/

export const generateTokens = (userId, role) => {
  const accessToken = generateAccessToken(userId, role);
  const refreshToken = generateRefreshToken(userId);

  return { accessToken, refreshToken };
};