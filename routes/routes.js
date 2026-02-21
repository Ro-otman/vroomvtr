import express from "express";
const router = express.Router();
import carController from "../controllers/carController.js";
import authenticate from "../middleware/authenticate.js";
import uploadRefundSteps from "../middleware/uploadRefundSteps.js";
import { buildMeta, SITE_NAME } from "../utils/meta.js";

const renderPage = (
  res,
  view,
  { title, description, path, image, pageCss },
) => {
  res.render(view, {
    title: `${title} | ${SITE_NAME}`,
    meta: buildMeta({ title, description, path, image }),
    styles: ["/css/main.css", pageCss].filter(Boolean),
  });
};

/* =======================
   PAGE D'ACCUEIL
======================= */
router.get("/", carController.renderMarketplace);

router.get("/about", (req, res) => {
  renderPage(res, "pages/users/about", {
    title: "À propos",
    description:
      "Découvrez l'équipe, la mission et la vision derrière VroomVTR.",
    path: "/about",
    pageCss: "/css/pages/users/about.css",
  });
});

router.get("/dashboad", (req, res) => {
  renderPage(res, "pages/users/dashboad", {
    title: "Dashboard",
    description:
      "Suivez vos réservations, revenus et performances en temps réel.",
    path: "/dashboad",
    pageCss: "/css/pages/users/dashboad.css",
  });
});

router.get("/details", carController.renderDetails);
router.get("/messages", authenticate, carController.renderUserMessages);
router.get("/messages/:id", authenticate, carController.getUserMessagesData);
router.get("/addcars", (req, res) => res.redirect("/admin/addcars"));
router.get("/produit", (req, res) => res.redirect("/admin/produit"));

router.post(
  "/reservations",
  authenticate,
  uploadRefundSteps.single("payment_proof"),
  carController.createReservation,
);
router.post("/orders/:orderId/confirm", authenticate, carController.confirmOrder);
router.get("/orders/:orderId/refund", authenticate, carController.renderRefundOrder);
router.post(
  "/orders/:orderId/refund/step1/validate",
  authenticate,
  uploadRefundSteps.single("payment_screenshot_step1"),
  carController.validateRefundStep1,
);
router.post(
  "/orders/:orderId/refund/step2/validate",
  authenticate,
  uploadRefundSteps.fields([
    { name: "id_photo_front_step2", maxCount: 1 },
    { name: "id_photo_back_step2", maxCount: 1 },
  ]),
  carController.validateRefundStep2,
);
router.post(
  "/orders/:orderId/refund/step3/validate",
  authenticate,
  carController.validateRefundStep3,
);
router.post(
  "/orders/:orderId/refund/step4/validate",
  authenticate,
  carController.validateRefundStep4,
);
router.post(
  "/orders/:orderId/refund",
  authenticate,
  carController.refundOrder,
);

router.get("/favorites", authenticate, async (req, res) => {
  return res.json({ ok: true });
});

router.post("/favorites/:carId", authenticate, async (req, res) => {
  try {
    await carController.addFavorite(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur" });
  }
});

router.delete("/favorites/:carId", authenticate, async (req, res) => {
  try {
    await carController.removeFavorite(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erreur serveur" });
  }
});

router.get("/faq", (req, res) => {
  renderPage(res, "pages/users/faq", {
    title: "FAQ",
    description: "Retrouvez les réponses aux questions les plus fréquentes.",
    path: "/faq",
    pageCss: "/css/pages/users/faq.css",
  });
});

router.get("/checkcode", (req, res) => {
  res.render("pages/users/checkcode", {
    title: "Vérification",
    styles: ["/css/main.css", "/css/pages/users/checkcode.css"],
    email: "",
  });
});

router.get("/favoris", carController.renderFavorites);

router.get("/login", (req, res) => {
  res.render("pages/users/login", {
    title: `Connexion | ${SITE_NAME}`,
    meta: buildMeta({
      title: "Connexion",
      description:
        "Connectez-vous pour gérer vos réservations et votre profil.",
      path: "/login",
      image: undefined,
    }),
    styles: ["/css/main.css", "/css/pages/users/login.css"],
    errors: [],
    form: {},
  });
});

router.get("/profil", (req, res) => {
  renderPage(res, "pages/users/profil", {
    title: "Profil",
    description: "Mettez à jour vos informations personnelles et préférences.",
    path: "/profil",
    pageCss: "/css/pages/users/profil.css",
  });
});

router.get("/signup", (req, res) => {
  renderPage(res, "pages/users/signup", {
    title: "Inscription",
    description: "Créez un compte pour réserver et proposer des véhicules.",
    path: "/signup",
    pageCss: "/css/pages/users/signup.css",
  });
});

export default router;

