import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import userModel from "../models/models.js";

const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";

const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  });

const signRefreshToken = (user) =>
  jwt.sign({ sub: user.id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  });

const setAuthCookies = (res, accessToken, refreshToken) => {
  const secure =
    process.env.NODE_ENV === "production" &&
    process.env.FORCE_HTTPS === "true";

  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const toSafeUser = (user) => ({
  id: user.id,
  email: user.email,
  first_name: user.first_name,
  last_name: user.last_name,
  role: user.role,
});

export const resolveSessionUser = async (req, res) => {
  const accessToken = req.cookies?.access_token;

  if (accessToken) {
    try {
      const payload = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
      const users = await userModel.getUserById(payload.sub);
      if (users.length) {
        return toSafeUser(users[0]);
      }
    } catch {
      // try refresh flow
    }
  }

  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) return null;

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const users = await userModel.getUserById(payload.sub);
    if (!users.length) return null;

    const user = users[0];
    if (!user.refresh_token_hash) return null;

    const ok = await bcrypt.compare(refreshToken, user.refresh_token_hash);
    if (!ok) return null;

    const newAccess = signAccessToken(user);
    const newRefresh = signRefreshToken(user);
    const newRefreshHash = await bcrypt.hash(newRefresh, 12);
    await userModel.updateRefreshToken(user.id, newRefreshHash);
    setAuthCookies(res, newAccess, newRefresh);

    return toSafeUser(user);
  } catch {
    return null;
  }
};
