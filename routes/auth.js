import express from "express";
import { body, validationResult } from "express-validator";
import authController from "../controllers/authController.js";

const router = express.Router();

router.post(
  "/register",
  [
    body("first_name").trim().isLength({ min: 3 }),
    body("last_name").trim().isLength({ min: 3 }),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render("pages/users/signup", {
        title: "Inscription",
        styles: ["/css/main.css", "/css/pages/users/signup.css"],
        errors: errors.array().map((e) => e.msg),
        form: {
          first_name: req.body.first_name,
          last_name: req.body.last_name,
          email: req.body.email,
          phone: req.body.phone,
        },
      });
    }
    return authController.register(req, res);
  },
);

router.post("/verify-code", (req, res) => authController.verifyCode(req, res));

router.post(
  "/login",
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render("pages/users/login", {
        title: "Connexion",
        styles: ["/css/main.css", "/css/pages/users/login.css"],
        errors: errors.array().map((e) => e.msg),
        form: { email: req.body.email },
      });
    }
    return authController.login(req, res);
  },
);

router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authController.me);

export default router;
