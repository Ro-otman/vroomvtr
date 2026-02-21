import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import userModel from "../models/models.js";

const ACCESS_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_IN = "7d";

const signAccessToken = (user) => {
  return jwt.sign(
    { sub: user.id, role: user.role },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN },
  );
};

const signRefreshToken = (user) => {
  return jwt.sign({ sub: user.id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  });
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  const secure =
    process.env.NODE_ENV === "production" && process.env.FORCE_HTTPS === "true";
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

const clearAuthCookies = (res) => {
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
};

const authController = {
  register: async (req, res) => {
    const { email, password, first_name, last_name, phone, password_confirm } =
      req.body;
    const errors = [];

    const nameRegex = /^[A-Za-zàâäéèêëïîôöùûüç' -]+$/;
    const cleanFirst = (first_name || "").trim();
    const cleanLast = (last_name || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (phone || "").trim();

    if (cleanFirst.length < 3) {
      errors.push("Le prénom doit contenir au moins 3 lettres");
    }
    if (!nameRegex.test(cleanFirst)) {
      errors.push("Le prénom ne doit pas contenir de chiffres");
    }
    if (cleanLast.length < 3) {
      errors.push("Le nom doit contenir au moins 3 lettres");
    }
    if (!nameRegex.test(cleanLast)) {
      errors.push("Le nom ne doit pas contenir de chiffres");
    }
    if (!cleanEmail) {
      errors.push("Email requis");
    }
    if (!cleanPhone) {
      errors.push("Telephone requis");
    }
    if (cleanPhone.includes("@")) {
      errors.push("Le numero de telephone est invalide");
    }
    if (cleanPhone && cleanEmail && cleanPhone.toLowerCase() === cleanEmail) {
      errors.push("Le numero de telephone ne peut pas etre l'email");
    }
    if (!password || password.length < 6) {
      errors.push("Le mot de passe doit contenir au moins 6 caractères");
    }
    if (password !== password_confirm) {
      errors.push("Les mots de passe ne correspondent pas");
    }

    if (errors.length) {
      return res.status(400).render("pages/users/signup", {
        title: "Inscription",
        styles: ["/css/main.css", "/css/pages/users/signup.css"],
        errors,
        form: {
          first_name: cleanFirst,
          last_name: cleanLast,
          email: cleanEmail,
          phone: cleanPhone,
        },
      });
    }

    const existing = await userModel.getUserByEmail(cleanEmail);
    if (existing.length) {
      return res.status(409).render("pages/users/signup", {
        title: "Inscription",
        styles: ["/css/main.css", "/css/pages/users/signup.css"],
        errors: ["Email déjà utilisé"],
        form: {
          first_name: cleanFirst,
          last_name: cleanLast,
          email: cleanEmail,
          phone: cleanPhone,
        },
      });
    }

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, 12);

    await userModel.upsertPendingUser({
      email: cleanEmail,
      password_hash: passwordHash,
      first_name: cleanFirst,
      last_name: cleanLast,
      phone: cleanPhone,
      verification_code: code,
      verification_expires: expiresAt,
    });

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: cleanEmail,
        subject: "Votre code de verification VroomVTR",
        text: `Votre code de verification est : ${code}\nCe code expire dans 10 minutes.\nSi vous n'avez pas demande ce code, ignorez ce message.`,
        html: `
          <div style="font-family: Arial, sans-serif; background:#f6f1fb; padding:24px;">
            <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid rgba(106,27,154,0.18); border-radius:14px; overflow:hidden;">
              <div style="background:linear-gradient(135deg,#6a1b9a,#8e24aa); padding:18px 24px;">
                <h1 style="margin:0; color:#ffffff; font-size:22px; letter-spacing:0.4px;">VroomVTR</h1>
                <p style="margin:6px 0 0; color:#eadcf5; font-size:13px;">S�curisez votre compte</p>
              </div>
              <div style="padding:24px;">
                <p style="margin:0 0 16px; color:#444; font-size:14px;">
                  Voici votre code de vérification :
                </p>
                <div style="font-size:28px; font-weight:700; letter-spacing:6px; color:#6a1b9a; background:#f3e8ff; padding:14px 16px; border-radius:10px; text-align:center;">
                  ${code}
                </div>
                <p style="margin:16px 0 0; color:#666; font-size:13px;">
                  Ce code expire dans 10 minutes.
                </p>
                <p style="margin:10px 0 0; color:#999; font-size:12px;">
                  Si vous n'avez pas demandé ce code, ignorez ce message.
                </p>
              </div>
            </div>
          </div>
        `,
      });
    } catch (err) {
      console.error("[MAIL] sendMail error:", err);
      return res.status(500).render("pages/users/signup", {
        title: "Inscription",
        styles: ["/css/main.css", "/css/pages/users/signup.css"],
        errors: ["Impossible d'envoyer l'email de v�rification"],
        form: {
          first_name: cleanFirst,
          last_name: cleanLast,
          email: cleanEmail,
          phone: cleanPhone,
        },
      });
    }

    return res.status(200).render("pages/users/checkcode", {
      title: "V�rification",
      styles: ["/css/main.css", "/css/pages/users/checkcode.css"],
      email: cleanEmail,
    });
  },

  login: async (req, res) => {
    const { email, password } = req.body;
    const users = await userModel.getUserByEmail(email);
    if (!users.length) {
      return res.status(401).render("pages/users/login", {
        title: "Connexion",
        styles: ["/css/main.css", "/css/pages/users/login.css"],
        errors: ["Identifiants invalides"],
        form: { email },
      });
    }
    const user = users[0];
    if (!user.is_active) {
      return res.status(403).render("pages/users/checkcode", {
        title: "V�rification",
        styles: ["/css/main.css", "/css/pages/users/checkcode.css"],
        email,
        errors: ["Compte non v�rifi�. V�rifiez votre email."],
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).render("pages/users/login", {
        title: "Connexion",
        styles: ["/css/main.css", "/css/pages/users/login.css"],
        errors: ["Identifiants invalides"],
        form: { email },
      });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const refreshHash = await bcrypt.hash(refreshToken, 12);
    await userModel.updateRefreshToken(user.id, refreshHash);

    setAuthCookies(res, accessToken, refreshToken);
    return res.redirect("/");
  },

  verifyCode: async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).render("pages/users/checkcode", {
        title: "Vérification",
        styles: ["/css/main.css", "/css/pages/users/checkcode.css"],
        email,
        errors: ["Email et code requis"],
      });
    }

    const rows = await userModel.verifyPendingCode(email, code);
    if (!rows.length) {
      return res.status(400).render("pages/users/checkcode", {
        title: "Vérification",
        styles: ["/css/main.css", "/css/pages/users/checkcode.css"],
        email,
        errors: ["Code invalide"],
      });
    }

    const {
      email: pendingEmail,
      password_hash,
      first_name,
      last_name,
      phone,
      verification_expires,
    } = rows[0];
    const safePhone =
      typeof phone === "string" && phone.includes("@") ? null : phone;

    if (verification_expires && new Date(verification_expires) < new Date()) {
      return res.status(400).render("pages/users/checkcode", {
        title: "Vérification",
        styles: ["/css/main.css", "/css/pages/users/checkcode.css"],
        email,
        errors: ["Code expiré. Demandez un nouveau code."],
      });
    }

    const existing = await userModel.getUserByEmail(pendingEmail);
    if (!existing.length) {
      const user = await userModel.createUser({
        email: pendingEmail,
        password_hash,
        first_name,
        last_name,
        phone: safePhone,
      });
      await userModel.markVerified(user.id);
    } else if (!existing[0].is_active) {
      await userModel.markVerified(existing[0].id);
    }

    await userModel.deletePendingUser(pendingEmail);
    return res.redirect("/login");
  },

  refresh: async (req, res) => {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ message: "Non autoris�" });

    try {
      const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
      const users = await userModel.getUserById(payload.sub);
      if (!users.length)
        return res.status(401).json({ message: "Non autoris�" });

      const user = users[0];
      if (!user.refresh_token_hash) {
        return res.status(401).json({ message: "Non autoris�" });
      }

      const ok = await bcrypt.compare(token, user.refresh_token_hash);
      if (!ok) return res.status(401).json({ message: "Non autoris�" });

      const accessToken = signAccessToken(user);
      const refreshToken = signRefreshToken(user);
      const refreshHash = await bcrypt.hash(refreshToken, 12);
      await userModel.updateRefreshToken(user.id, refreshHash);

      setAuthCookies(res, accessToken, refreshToken);
      return res.json({ message: "OK" });
    } catch {
      return res.status(401).json({ message: "Non autoris�" });
    }
  },

  logout: async (req, res) => {
    const token = req.cookies?.refresh_token;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
        await userModel.clearRefreshToken(payload.sub);
      } catch {
        // ignore
      }
    }
    clearAuthCookies(res);
    if (req.headers.accept && req.headers.accept.includes("text/html")) {
      return res.redirect("/login");
    }
    return res.json({ message: "Déconnecté" });
  },

  me: async (req, res) => {
    const token = req.cookies?.access_token;
    if (!token) return res.status(401).json({ message: "Non autorisé" });
    try {
      const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const users = await userModel.getUserById(payload.sub);
      if (!users.length)
        return res.status(404).json({ message: "Introuvable" });
      const user = users[0];
      return res.json({ id: user.id, email: user.email, role: user.role });
    } catch {
      return res.status(401).json({ message: "Non autorisé" });
    }
  },
};

export default authController;
