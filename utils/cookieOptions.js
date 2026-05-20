const normalizeSameSite = (value, fallback) => {
  const normalized = (value || "").toLowerCase();

  if (["strict", "lax", "none"].includes(normalized)) {
    return normalized;
  }

  return fallback;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
};

const getBaseAuthCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const secure = parseBoolean(process.env.COOKIE_SECURE, isProduction);
  const sameSite = normalizeSameSite(
    process.env.COOKIE_SAME_SITE,
    isProduction ? "none" : "lax"
  );

  const options = {
    httpOnly: true,
    secure,
    sameSite
  };

  if (process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  }

  return options;
};

export const getAuthCookieOptions = (maxAge) => {
  const options = getBaseAuthCookieOptions();

  if (typeof maxAge === "number") {
    options.maxAge = maxAge;
  }

  return options;
};

export const getClearAuthCookieOptions = () => {
  return getBaseAuthCookieOptions();
};
