import {
  clearAdminAuthCookies,
  resolveAdminSession,
} from "../utils/adminSession.js";

const requireAdmin = async (req, res, next) => {
  const wantsHtml = (req.headers.accept || "").includes("text/html");
  const admin = await resolveAdminSession(req, res);
  if (!admin) {
    clearAdminAuthCookies(res);
    if (wantsHtml) return res.redirect("/admin/login");
    return res.status(401).json({ message: "Session admin invalide" });
  }

  req.admin = admin;
  return next();
};

export default requireAdmin;
