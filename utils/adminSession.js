import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import userModel from "../models/models.js";

const ADMIN_ACCESS_EXPIRES_IN = "15m";
const ADMIN_REFRESH_EXPIRES_IN = "7d";

const getAdminAccessSecret = () =>
  process.env.ADMIN_ACCESS_TOKEN_SECRET || process.env.ACCESS_TOKEN_SECRET;

const getAdminRefreshSecret = () =>
  process.env.ADMIN_REFRESH_TOKEN_SECRET || process.env.REFRESH_TOKEN_SECRET;

const signAdminAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: "admin" }, getAdminAccessSecret(), {
    expiresIn: ADMIN_ACCESS_EXPIRES_IN,
  });

const signAdminRefreshToken = (user) =>
  jwt.sign({ sub: user.id, role: "admin" }, getAdminRefreshSecret(), {
    expiresIn: ADMIN_REFRESH_EXPIRES_IN,
  });

export const setAdminAuthCookies = (res, accessToken, refreshToken) => {
  const secure =
    process.env.NODE_ENV === "production" &&
    process.env.FORCE_HTTPS === "true";

  res.cookie("admin_access_token", accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("admin_refresh_token", refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const clearAdminAuthCookies = (res) => {
  const secure =
    process.env.NODE_ENV === "production" &&
    process.env.FORCE_HTTPS === "true";

  const opts = { httpOnly: true, secure, sameSite: "lax" };
  res.clearCookie("admin_access_token", opts);
  res.clearCookie("admin_refresh_token", opts);
  // Compat with previous implementation
  res.clearCookie("admin_session", opts);
};

export const createAdminSession = async (user, res) => {
  const accessToken = signAdminAccessToken(user);
  const refreshToken = signAdminRefreshToken(user);
  const refreshHash = await bcrypt.hash(refreshToken, 12);
  await userModel.updateRefreshToken(user.id, refreshHash);
  setAdminAuthCookies(res, accessToken, refreshToken);
};

export const resolveAdminSession = async (req, res) => {
  const accessToken = req.cookies?.admin_access_token;
  if (accessToken) {
    try {
      const payload = jwt.verify(accessToken, getAdminAccessSecret());
      if (payload?.role !== "admin") return null;
      const users = await userModel.getUserById(payload.sub);
      if (!users.length || users[0].role !== "admin") return null;
      return { id: users[0].id, role: "admin" };
    } catch {
      // try refresh flow
    }
  }

  const refreshToken = req.cookies?.admin_refresh_token;
  if (!refreshToken) return null;

  try {
    const payload = jwt.verify(refreshToken, getAdminRefreshSecret());
    if (payload?.role !== "admin") return null;
    const users = await userModel.getUserById(payload.sub);
    if (!users.length || users[0].role !== "admin") return null;

    const user = users[0];
    if (!user.refresh_token_hash) return null;

    const ok = await bcrypt.compare(refreshToken, user.refresh_token_hash);
    if (!ok) return null;

    await createAdminSession(user, res);
    return { id: user.id, role: "admin" };
  } catch {
    return null;
  }
};

