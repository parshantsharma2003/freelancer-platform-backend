const getBaseAuthCookieOptions = () => {
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none"
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
