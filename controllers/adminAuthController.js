import userModel from "../models/models.js";
import { buildMeta, SITE_NAME } from "../utils/meta.js";
import {
  clearAdminAuthCookies,
  createAdminSession,
} from "../utils/adminSession.js";

const renderLoginPage = (
  res,
  { errors = [], form = {}, adminConfigMissing = false } = {},
) =>
  res.render("pages/admin/login", {
    title: `Connexion Admin | ${SITE_NAME}`,
    layout: false,
    meta: buildMeta({
      title: "Connexion Admin",
      description: "Acces securise a l'espace administrateur.",
      path: "/admin/login",
      image: undefined,
    }),
    styles: ["/css/main.css", "/css/pages/admin/login.css"],
    errors,
    form,
    adminConfigMissing,
  });

const adminAuthController = {
  renderLogin: (req, res) => renderLoginPage(res),

  login: async (req, res) => {
    const { admin_key } = req.body;
    const errors = [];

    const expectedAdminKey = process.env.ADMIN_LOGIN_KEY || "";
    const adminConfigMissing = !expectedAdminKey;

    if (!admin_key) errors.push("Cle admin requise");

    if (!adminConfigMissing && admin_key !== expectedAdminKey) {
      errors.push("Cle admin invalide");
    }

    if (errors.length || adminConfigMissing) {
      return renderLoginPage(res, {
        errors,
        adminConfigMissing,
      });
    }

    const users = await userModel.getUserByRole("admin");
    if (!users.length) {
      return renderLoginPage(res, {
        errors: ["Aucun compte admin trouve en base"],
      });
    }

    const user = users[0];
    await createAdminSession(user, res);

    return res.redirect("/admin/dashboard");
  },

  logout: (req, res) => {
    clearAdminAuthCookies(res);
    return res.redirect("/admin/login");
  },
};

export default adminAuthController;
