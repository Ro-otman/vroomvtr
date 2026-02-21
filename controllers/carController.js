import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import sharp from "sharp";
import userModel from "../models/models.js";
import { buildMeta, SITE_NAME } from "../utils/meta.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.join(__dirname, "..", "public", "uploads");
const uploadDir = path.join(uploadsRoot, "cars");
const proofUploadDir = path.join(uploadsRoot, "reservation-proofs");

const ensureUploadDir = async () => {
  const { default: fs } = await import("fs/promises");
  await fs.mkdir(uploadDir, { recursive: true });
};

const ensureProofUploadDir = async () => {
  const { default: fs } = await import("fs/promises");
  await fs.mkdir(proofUploadDir, { recursive: true });
};

const removeLocalImageByUrl = async (url) => {
  try {
    if (!url) return;
    const normalized = String(url).trim();
    if (!normalized.startsWith("/uploads/")) return;
    const rel = normalized.replace(/^\/uploads\//, "");
    const target = path.join(uploadsRoot, rel);
    const { default: fs } = await import("fs/promises");
    await fs.unlink(target);
  } catch {
    // ignore if file does not exist
  }
};

const timeAgo = (dateValue) => {
  const d = new Date(dateValue);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.max(Math.floor(diffMs / 60000), 0);
  if (mins < 1) return "A l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days} j`;
};

const carController = {
  renderAdminDashboard: async (req, res) => {
    const stats = await userModel.getAdminDashboardStats();
    let verificationCodes = [];
    try {
      await userModel.ensureOrderVerificationCodesForPendingOrders();
      verificationCodes = await userModel.getOrderVerificationCodesForAdmin();
    } catch (err) {
      console.error("[ADMIN] verification codes unavailable:", err?.message || err);
    }
    const recentActivity = (stats.recentActivity || []).map((ev) => {
      if (ev.kind === "order") {
        const isConfirmed = ev.detail === "confirmed";
        return {
          text: `Commande #${String(ev.ref_id).slice(0, 8).toUpperCase()} ${isConfirmed ? "confirmée" : "enregistrée"}`,
          tone: isConfirmed ? "ok" : "warn",
          time: timeAgo(ev.created_at),
        };
      }
      if (ev.kind === "car") {
        return {
          text: "Nouveau véhicule ajouté dans Produits",
          tone: "",
          time: timeAgo(ev.created_at),
        };
      }
      return {
        text: "Nouvel utilisateur inscrit",
        tone: "",
        time: timeAgo(ev.created_at),
      };
    });

    return res.render("pages/admin/dashboard", {
      title: `Dashboard | ${SITE_NAME}`,
      layout: "layouts/admin",
      meta: buildMeta({
        title: "Dashboard",
        description: "Vue d'ensemble admin.",
        path: "/admin/dashboard",
        image: undefined,
      }),
      styles: [
        "/css/main.css",
        "/css/pages/admin/admin.css",
        "/css/pages/admin/dashboard.css",
      ],
      dashboard: {
        salesToday: stats.salesToday || 0,
        pendingOrders: stats.pendingOrders || 0,
        unreadMessages: stats.unreadMessages || 0,
        activeUsers: stats.activeUsers || 0,
        conversionRate: stats.conversionRate || 0,
        supportRate: stats.supportRate || 0,
        uptimeRate: stats.uptimeRate || 99.9,
      },
      recentActivity,
      verificationCodes,
    });
  },
  renderMarketplace: async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = 6;
    const sellerType = ["particulier", "entreprise"].includes(
      String(req.query.seller_type || "").toLowerCase(),
    )
      ? String(req.query.seller_type || "").toLowerCase()
      : "";
    const filters = {
      q: req.query.q || "",
      category_id: req.query.category_id || "",
      brand: req.query.brand || "",
      model: req.query.model || "",
      fuel_type: req.query.fuel_type || "",
      seller_type: sellerType,
      price_min: req.query.price_min ? Number(req.query.price_min) : null,
      price_max: req.query.price_max ? Number(req.query.price_max) : null,
    };
    const sort = req.query.sort || "recent";

    const [cars, total, categories, brands, favIds] = await Promise.all([
      userModel.getCars({ filters, sort, page, limit }),
      userModel.countCars({ filters }),
      userModel.getCategories(),
      userModel.getBrands(),
      res.locals.user
        ? userModel.getFavoriteIdsByUser(res.locals.user.id)
        : Promise.resolve([]),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.render("pages/users/index", {
      title: `Accueil | ${SITE_NAME}`,
      meta: buildMeta({
        title: "Accueil",
        description:
          "Réservez et gérez vos véhicules facilement. Trouvez, comparez et réservez en quelques clics.",
        path: "/",
        image: undefined,
      }),
      styles: ["/css/main.css", "/css/pages/users/index.css"],
      cars,
      favIds,
      categories,
      brands,
      filters,
      sort,
      page,
      totalPages,
      total,
    });
  },
  renderAddCars: async (req, res) => {
    const editingCarId = req.params.id || null;
    let vendors = [];
    let categories = [];
    let car = null;

    try {
      [vendors, categories] = await Promise.all([
        userModel.getVendors(),
        userModel.getCategories(),
      ]);
      if (editingCarId) {
        car = await userModel.getCarById(editingCarId);
      }
    } catch (err) {
      console.error("[DB] Failed to load vendors/categories:", err);
    }

    return res.render("pages/admin/addcars", {
      title: `${car ? "Modifier la voiture" : "Ajouter une voiture"} | ${SITE_NAME}`,
      layout: "layouts/admin",
      meta: buildMeta({
        title: car ? "Modifier la voiture" : "Ajouter une voiture",
        description: car
          ? "Modifiez un véhicule de la marketplace."
          : "Ajoutez un nouveau véhicule a la marketplace.",
        path: car ? `/admin/addcars/${editingCarId}/edit` : "/admin/addcars",
        image: undefined,
      }),
      styles: ["/css/main.css", "/css/pages/admin/admin.css", "/css/pages/admin/addcars.css"],
      vendors,
      categories,
      car,
      isEdit: Boolean(car),
      formAction: car ? `/admin/cars/${car.id}/update` : "/admin/cars",
      errors: [],
    });
  },
  renderAdminProducts: async (req, res) => {
    const cars = await userModel.getCars({
      filters: {},
      sort: "recent",
      page: 1,
      limit: 500,
    });

    return res.render("pages/admin/produit", {
      title: `Produits | ${SITE_NAME}`,
      layout: "layouts/admin",
      meta: buildMeta({
        title: "Produits",
        description: "Gestion des produits.",
        path: "/admin/produit",
        image: undefined,
      }),
      styles: ["/css/main.css", "/css/pages/admin/admin.css", "/css/pages/admin/produit.css"],
      cars,
    });
  },
  renderDetails: async (req, res) => {
    const carId = req.query.id;
    if (!carId) {
      return res.status(404).render("pages/users/details", {
        title: "Details | VroomVTR",
        styles: ["/css/main.css", "/css/pages/users/details.css"],
        car: null,
        images: [],
      });
    }

    const car = await userModel.getCarById(carId);
    if (!car) {
      return res.status(404).render("pages/users/details", {
        title: "Details | VroomVTR",
        styles: ["/css/main.css", "/css/pages/users/details.css"],
        car: null,
        images: [],
      });
    }

    const [images, isFavorite] = await Promise.all([
      userModel.getCarImages(carId),
      res.locals.user
        ? userModel.isFavorite(res.locals.user.id, carId)
        : Promise.resolve(false),
    ]);

    let messages = [];
    let conversationId = "";
    if (res.locals.user) {
      const convo = await userModel.getConversation(
        res.locals.user.id,
        car.vendor_id,
        car.id,
      );
      if (convo) {
        conversationId = convo.id;
        messages = await userModel.getMessages(convo.id);
      }
    }

    return res.render("pages/users/details", {
      title: `Details | ${SITE_NAME}`,
      meta: buildMeta({
        title: `${car.brand} ${car.model}`,
        description: car.description || "Details du véhicule",
        path: `/details?id=${car.id}`,
        image: images[0]?.url,
      }),
      styles: ["/css/main.css", "/css/pages/users/details.css"],
      car,
      images,
      isFavorite,
      messages,
      conversationId,
    });
  },
  renderFavorites: async (req, res) => {
    const userId = res.locals.user?.id;
    let favorites = [];
    let message = "";

    if (!userId) {
      message = "Connectez-vous pour voir vos favoris.";
    } else {
      favorites = await userModel.getFavoritesByUser(userId);
      if (!favorites.length) {
        message = "Aucun favori pour le moment.";
      }
    }

    return res.render("pages/users/favoris", {
      title: `Favoris | ${SITE_NAME}`,
      meta: buildMeta({
        title: "Favoris",
        description: "Vos véhicules enregistrés pour les consulter plus tard.",
        path: "/favoris",
        image: undefined,
      }),
      styles: ["/css/main.css", "/css/pages/users/favoris.css"],
      favorites,
      message,
    });
  },
  renderUserMessages: async (req, res) => {
    const userId = res.locals.user?.id;
    if (!userId) {
      return res.redirect("/login");
    }

    const conversations = await userModel.getConversationsForUser(userId);
    const first = conversations[0] || null;
    const messages = first ? await userModel.getMessages(first.id) : [];

    return res.render("pages/users/messages", {
      title: `Messages | ${SITE_NAME}`,
      meta: buildMeta({
        title: "Messages",
        description: "Vos discussions avec les vendeurs.",
        path: "/messages",
        image: undefined,
      }),
      styles: ["/css/main.css", "/css/pages/users/messages.css"],
      noFooter: true,
      noFab: true,
      conversations,
      messages,
      activeConversationId: first ? first.id : "",
      activeCarId: first ? first.car_id : "",
      activeVendorId: first ? first.vendor_id : "",
    });
  },
  getUserMessagesData: async (req, res) => {
    const userId = res.locals.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Non autorise" });
    }
    const conversationId = req.params.id;
    if (!conversationId) {
      return res.status(400).json({ ok: false, message: "id manquant" });
    }

    const conversations = await userModel.getConversationsForUser(userId);
    const convo = conversations.find((c) => c.id === conversationId);
    if (!convo) {
      return res.status(404).json({ ok: false, message: "conversation introuvable" });
    }

    await userModel.markConversationReadByUser(userId, conversationId);
    const messages = await userModel.getMessages(conversationId);
    return res.json({
      ok: true,
      conversationId,
      vendor: {
        id: convo.vendor_id,
        name: convo.vendor_name || "Vendeur",
        avatar: convo.vendor_avatar || "",
      },
      car: {
        id: convo.car_id,
        label: `${convo.brand || ""} ${convo.model || ""}`.trim(),
        image: convo.car_image || "",
      },
      messages,
    });
  },
  renderAdminMessages: async (req, res) => {
    const conversations = await userModel.getConversationsForAdmin();
    const first = conversations[0] || null;
    const messages = first ? await userModel.getMessages(first.id) : [];

    return res.render("pages/admin/messages", {
      title: `Messages | ${SITE_NAME}`,
      layout: "layouts/admin",
      meta: buildMeta({
        title: "Messages",
        description: "Messagerie admin.",
        path: "/admin/messages",
        image: undefined,
      }),
      styles: [
        "/css/main.css",
        "/css/pages/admin/admin.css",
        "/css/pages/admin/messages.css",
      ],
      conversations,
      messages,
      activeConversationId: first ? first.id : "",
    });
  },
  renderAdminOrders: async (req, res) => {
    const orders = await userModel.getAllCommandesForAdmin();
    return res.render("pages/admin/orders", {
      title: `Commandes | ${SITE_NAME}`,
      layout: "layouts/admin",
      meta: buildMeta({
        title: "Commandes",
        description: "Toutes les commandes clients de la plateforme.",
        path: "/admin/orders",
        image: undefined,
      }),
      styles: [
        "/css/main.css",
        "/css/pages/admin/admin.css",
        "/css/pages/admin/orders.css",
      ],
      orders,
    });
  },
  renderAdminUsers: async (req, res) => {
    const users = await userModel.getAdminUsers();
    return res.render("pages/admin/users", {
      title: `Users | ${SITE_NAME}`,
      layout: "layouts/admin",
      meta: buildMeta({
        title: "Users",
        description: "Liste des utilisateurs de la plateforme.",
        path: "/admin/users",
        image: undefined,
      }),
      styles: [
        "/css/main.css",
        "/css/pages/admin/admin.css",
        "/css/pages/admin/users.css",
      ],
      users,
    });
  },
  getAdminMessagesData: async (req, res) => {
    const conversationId = req.params.id;
    if (!conversationId) {
      return res.status(400).json({ ok: false, message: "id manquant" });
    }

    const convo = await userModel.getConversationById(conversationId);
    if (!convo) {
      return res.status(404).json({ ok: false, message: "conversation introuvable" });
    }

    const messages = await userModel.getMessages(conversationId);
    await userModel.markConversationReadByAdmin(conversationId);
    return res.json({
      ok: true,
      conversationId,
      user: {
        id: convo.user_id,
        first_name: convo.first_name || "",
        last_name: convo.last_name || "",
        email: convo.email || "",
      },
      messages,
    });
  },
  addFavorite: async (req, res) => {
    const userId = req.user?.id;
    const carId = req.params.carId;
    if (!userId || !carId) {
      return res.status(400).json({ message: "Requete invalide" });
    }

    try {
      await userModel.addFavorite(userId, carId);
      return res.json({ ok: true, action: "added" });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY") {
        return res.json({ ok: true, action: "exists" });
      }
      throw err;
    }
  },

  removeFavorite: async (req, res) => {
    const userId = req.user?.id;
    const carId = req.params.carId;
    if (!userId || !carId) {
      return res.status(400).json({ message: "Requete invalide" });
    }

    await userModel.removeFavorite(userId, carId);
    return res.json({ ok: true, action: "removed" });
  },
  confirmOrder: async (req, res) => {
    try {
      const userId = req.user?.id;
      const orderId = req.params.orderId;
      if (!userId || !orderId) {
        return res.status(400).json({ ok: false, message: "Requete invalide" });
      }
      const confirmed = await userModel.confirmCommandeByUser(orderId, userId);
      if (!confirmed) {
        return res.redirect("/?order_unavailable=1");
      }
      await userModel.deactivateOrderVerificationCodes(orderId);

      return res.redirect("/?order_confirmed=1");
    } catch (err) {
      console.error("[ORDER] confirm error:", err);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  },
  validateRefundStep1: async (req, res) => {
    try {
      const userId = req.user?.id;
      const orderId = req.params.orderId;
      if (!userId || !orderId) {
        return res.status(400).json({ ok: false, message: "Requete invalide" });
      }

      const order = await userModel.getCommandeByIdForUser(orderId, userId);
      if (!order || order.status !== "pending") {
        return res.status(404).json({
          ok: false,
          message: "Commande introuvable ou déjà traitee.",
        });
      }

      const fullName = String(req.body?.refund_full_name || "").trim();
      const phone = String(req.body?.refund_phone || "").trim();
      const email = String(req.body?.refund_email || "").trim();
      const orderDate = String(req.body?.refund_order_date || "").trim();
      const amountPaid = String(req.body?.refund_amount_paid || "").trim();
      const paymentMethod = String(req.body?.refund_payment_method || "").trim();
      const paymentScreenshot = req.file;

      if (
        !fullName ||
        !phone ||
        !email ||
        !orderDate ||
        !amountPaid ||
        !paymentMethod
      ) {
        return res.status(400).json({
          ok: false,
          message: "Etape 1: tous les champs sont obligatoires.",
        });
      }

      if (!paymentScreenshot) {
        return res.status(400).json({
          ok: false,
          message: "Etape 1: capture d'ecran du paiement requise.",
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          ok: false,
          message: "Etape 1: adresse email invalide.",
        });
      }

      await userModel.ensureOrderVerificationCodes(orderId);
      await userModel.markRefundStep1Verified(orderId);

      return res.json({
        ok: true,
        message: "Etape 1 validee. Passez a l'étape 2.",
      });
    } catch (err) {
      console.error("[ORDER] refund step1 error:", err);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  },
  validateRefundStep2: async (req, res) => {
    try {
      const userId = req.user?.id;
      const orderId = req.params.orderId;
      if (!userId || !orderId) {
        return res.status(400).json({ ok: false, message: "Requete invalide" });
      }

      const order = await userModel.getCommandeByIdForUser(orderId, userId);
      if (!order || order.status !== "pending") {
        return res.status(404).json({
          ok: false,
          message: "Commande introuvable ou déjà traitee.",
        });
      }

      const frontPhoto = req.files?.id_photo_front_step2?.[0];
      const backPhoto = req.files?.id_photo_back_step2?.[0];
      const refundIban = String(req.body?.refund_iban_step2 || "").trim();
      const refundAccountHolder = String(
        req.body?.refund_account_holder_step2 || "",
      ).trim();

      if (!frontPhoto || !backPhoto) {
        return res.status(400).json({
          ok: false,
          message: "Etape 2: photos recto et verso requises.",
        });
      }

      if (!refundIban || !refundAccountHolder) {
        return res.status(400).json({
          ok: false,
          message:
            "Etape 2: coordonnees bancaires pour recevoir le remboursement requises.",
        });
      }

      await userModel.ensureOrderVerificationCodes(orderId);
      const state = await userModel.getOrderVerificationState(orderId);
      if (!state.step1_verified) {
        return res.status(400).json({
          ok: false,
          message: "Validez d'abord l'étape 1.",
        });
      }
      await userModel.markRefundStep2Verified(orderId);

      return res.json({
        ok: true,
        message:
          "Etape 2 validee. Veuillez contacter le support pour recevoir le code #1.",
      });
    } catch (err) {
      console.error("[ORDER] refund step2 error:", err);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  },
  validateRefundStep3: async (req, res) => {
    try {
      const userId = req.user?.id;
      const orderId = req.params.orderId;
      const step3 = String(req.body?.verification_code_step3 || "").trim();

      if (!userId || !orderId) {
        return res.status(400).json({ ok: false, message: "Requete invalide" });
      }

      const order = await userModel.getCommandeByIdForUser(orderId, userId);
      if (!order || order.status !== "pending") {
        return res.status(404).json({
          ok: false,
          message: "Commande introuvable ou déjà traitee.",
        });
      }

      if (!/^\d{4,8}$/.test(step3)) {
        return res.status(400).json({
          ok: false,
          message: "Etape 3: code de verification invalide.",
        });
      }

      await userModel.ensureOrderVerificationCodes(orderId);
      const result = await userModel.validateAndAdvanceRefundStep3(orderId, step3);
      if (!result.ok) {
        return res.status(400).json({ ok: false, message: result.message });
      }

      return res.json({
        ok: true,
        message:
          "Etape 3 validee. Demandez le code #2 a l'administrateur.",
      });
    } catch (err) {
      console.error("[ORDER] refund step3 error:", err);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  },
  validateRefundStep4: async (req, res) => {
    try {
      const userId = req.user?.id;
      const orderId = req.params.orderId;
      const step4 = String(req.body?.verification_code_step4 || "").trim();

      if (!userId || !orderId) {
        return res.status(400).json({ ok: false, message: "Requete invalide" });
      }

      const order = await userModel.getCommandeByIdForUser(orderId, userId);
      if (!order || order.status !== "pending") {
        return res.status(404).json({
          ok: false,
          message: "Commande introuvable ou déjà traitee.",
        });
      }

      if (!/^\d{4,8}$/.test(step4)) {
        return res.status(400).json({
          ok: false,
          message: "Etape 4: code de verification invalide.",
        });
      }

      const result = await userModel.validateAndAdvanceRefundStep4(orderId, step4);
      if (!result.ok) {
        return res.status(400).json({ ok: false, message: result.message });
      }

      return res.json({
        ok: true,
        message: "Etape 4 validee. Demandez le code #3 a l'administrateur.",
      });
    } catch (err) {
      console.error("[ORDER] refund step4 error:", err);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  },
  refundOrder: async (req, res) => {
    try {
      const userId = req.user?.id;
      const orderId = req.params.orderId;
      if (!userId || !orderId) {
        return res.status(400).json({ ok: false, message: "Requete invalide" });
      }

      const order = await userModel.getCommandeByIdForUser(orderId, userId);
      if (!order || order.status !== "pending") {
        return res.status(404).render("pages/users/order-confirm", {
          title: `Remboursement commande | ${SITE_NAME}`,
          layout: "layouts/main",
          meta: buildMeta({
            title: "Remboursement commande",
            description: "Validation du remboursement en 5 étapes.",
            path: `/orders/${orderId}/refund`,
            image: undefined,
          }),
          styles: ["/css/main.css", "/css/pages/users/order-confirm.css"],
          order: null,
          errors: ["Commande introuvable ou déjà traitee."],
          form: {},
          mode: "refund",
          noFab: true,
        });
      }

      const {
        verification_code_step3,
        verification_code_step4,
        verification_code_step5,
      } = req.body || {};
      await userModel.ensureOrderVerificationCodes(orderId);
      const state = await userModel.getOrderVerificationState(orderId);

      const errors = [];
      if (!state.step1_verified) {
        errors.push("Etape 1 non validee.");
      }
      if (!state.step2_verified) {
        errors.push("Etape 2 non validee.");
      }
      if (!state.step3_verified) {
        errors.push("Etape 3 non validee.");
      }
      if (!state.step4_verified) {
        errors.push("Etape 4 non validee.");
      }

      if (!errors.length) {
        const check = await userModel.verifyOrderCodes({
          orderId,
          step3: verification_code_step3,
          step4: verification_code_step4,
          step5: verification_code_step5,
        });
        if (!check.exists) {
          errors.push(
            "Codes admin indisponibles pour cette commande. Contactez l'administrateur.",
          );
        } else {
          if (!check.step3Ok) errors.push("Code #1 incorrect.");
          if (!check.step4Ok) errors.push("Code #2 incorrect.");
          if (!check.step5Ok) errors.push("Code #3 incorrect.");
        }
      }

      if (errors.length) {
        return res.status(400).render("pages/users/order-confirm", {
          title: `Remboursement commande | ${SITE_NAME}`,
          layout: "layouts/main",
          meta: buildMeta({
            title: "Remboursement commande",
            description: "Validation du remboursement en 5 étapes.",
            path: `/orders/${orderId}/refund`,
            image: undefined,
          }),
          styles: ["/css/main.css", "/css/pages/users/order-confirm.css"],
          order,
          errors,
          form: {
            verification_code_step3,
            verification_code_step4,
            verification_code_step5,
          },
          mode: "refund",
          resumeStep: state.resume_step || 1,
          noFab: true,
        });
      }

      await userModel.refundCommandeByUser(orderId, userId);
      await userModel.deactivateOrderVerificationCodes(orderId);

      const back = req.get("referer") || "/";
      return res.redirect(back);
    } catch (err) {
      console.error("[ORDER] refund error:", err);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  },
  renderRefundOrder: async (req, res) => {
    try {
      const userId = req.user?.id;
      const orderId = req.params.orderId;
      if (!userId || !orderId) {
        return res.redirect("/");
      }
      const order = await userModel.getCommandeByIdForUser(orderId, userId);
      if (!order || order.status !== "pending") {
        return res.status(404).render("pages/users/order-confirm", {
          title: `Remboursement commande | ${SITE_NAME}`,
          layout: "layouts/main",
          meta: buildMeta({
            title: "Remboursement commande",
            description: "Validation du remboursement en 5 étapes.",
            path: `/orders/${orderId}/refund`,
            image: undefined,
          }),
          styles: ["/css/main.css", "/css/pages/users/order-confirm.css"],
          order: null,
          errors: ["Commande introuvable ou déjà traitee."],
          form: {},
          mode: "refund",
          noFab: true,
        });
      }
      await userModel.ensureOrderVerificationCodes(orderId);
      const state = await userModel.getOrderVerificationState(orderId);

      return res.render("pages/users/order-confirm", {
        title: `Remboursement commande | ${SITE_NAME}`,
        layout: "layouts/main",
        meta: buildMeta({
          title: "Remboursement commande",
          description: "Validation du remboursement en 5 étapes.",
          path: `/orders/${orderId}/refund`,
          image: undefined,
        }),
        styles: ["/css/main.css", "/css/pages/users/order-confirm.css"],
        order,
        errors: [],
        form: {},
        mode: "refund",
        resumeStep: state.resume_step || 1,
        noFab: true,
      });
    } catch (err) {
      console.error("[ORDER] render refund page error:", err);
      return res.redirect("/");
    }
  },
  createReservation: async (req, res) => {
    try {
      const userId = req.user?.id;
      const { car_id, country, address, city, postal_code, payment_method } =
        req.body;
      const paymentProof = req.file;

      if (!userId) {
        return res.status(401).json({ ok: false, message: "Non autorise" });
      }

      if (
        !car_id ||
        !country ||
        !address ||
        !city ||
        !postal_code ||
        !payment_method
      ) {
        return res
          .status(400)
          .json({ ok: false, message: "Champs obligatoires manquants" });
      }

      if (!["bank", "paypal"].includes(payment_method)) {
        return res
          .status(400)
          .json({ ok: false, message: "Moyen de paiement invalide" });
      }

      if (!paymentProof) {
        return res.status(400).json({
          ok: false,
          message:
            payment_method === "bank"
              ? "Ajoutez la capture de preuve du virement bancaire."
              : "Ajoutez la capture de preuve du paiement PayPal.",
        });
      }

      const car = await userModel.getCarById(car_id);
      if (!car) {
        return res.status(404).json({ ok: false, message: "Véhicule introuvable" });
      }

      const existingPending = await userModel.hasPendingCommandeForUserCar(
        userId,
        car.id,
      );
      if (existingPending) {
        return res.status(409).json({
          ok: false,
          message: "Vous avez déjà une reservation en cours pour ce véhicule",
        });
      }

      await ensureProofUploadDir();
      const proofFilename = `${randomUUID()}.webp`;
      const proofOutputPath = path.join(proofUploadDir, proofFilename);
      const paymentProofUrl = `/uploads/reservation-proofs/${proofFilename}`;
      await sharp(paymentProof.buffer)
        .rotate()
        .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(proofOutputPath);

      let commande;
      try {
        commande = await userModel.createCommande({
          user_id: userId,
          car_id: car.id,
          vendor_id: car.vendor_id,
          amount: Number(car.price),
          country: String(country).trim(),
          city: String(city).trim(),
          address: String(address).trim(),
          postal_code: String(postal_code).trim(),
          payment_method,
          payment_proof_url: paymentProofUrl,
        });
      } catch (err) {
        await removeLocalImageByUrl(paymentProofUrl);
        throw err;
      }

      return res.json({
        ok: true,
        message: "Reservation enregistrée",
        commandeId: commande.id,
        paymentProofUrl,
      });
    } catch (err) {
      console.error("[RESERVATION] create error:", err);
      return res
        .status(500)
        .json({ ok: false, message: "Erreur serveur lors de la reservation" });
    }
  },
  create: async (req, res) => {
    try {
      const {
        brand,
        model,
        year,
        price,
        mileage,
        fuel_type,
        transmission,
        vendor_id,
        category_id,
        description,
        seats,
      } = req.body;

      if (!brand || !model || !price || !vendor_id || !category_id) {
        return res.status(400).render("pages/admin/addcars", {
          title: "Ajouter une voiture | VroomVTR",
          layout: "layouts/admin",
          styles: ["/css/main.css", "/css/pages/admin/admin.css", "/css/pages/admin/addcars.css"],
          errors: ["Champs obligatoires manquants"],
          vendors: await userModel.getVendors(),
          categories: await userModel.getCategories(),
          car: null,
          isEdit: false,
          formAction: "/admin/cars",
        });
      }

      await ensureUploadDir();

      const car = await userModel.createCar({
        vendor_id,
        category_id,
        brand,
        model,
        year: year ? Number(year) : null,
        price: Number(price),
        mileage: mileage ? Number(mileage) : null,
        fuel_type,
        transmission,
        seats: seats ? Number(seats) : null,
        description,
      });

      const files = req.files || [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const filename = `${car.id}-${randomUUID()}.webp`;
        const outputPath = path.join(uploadDir, filename);

        await sharp(file.buffer)
          .resize(1200, 800, { fit: "cover", position: "center" })
          .webp({ quality: 80 })
          .toFile(outputPath);

        await userModel.addCarImage({
          car_id: car.id,
          url: `/uploads/cars/${filename}`,
          is_main: i === 0,
        });
      }

      return res.redirect("/admin/addcars");
    } catch (err) {
      console.error("[CAR] create error:", err);
      return res.status(500).render("pages/admin/addcars", {
        title: "Ajouter une voiture | VroomVTR",
        layout: "layouts/admin",
        styles: ["/css/main.css", "/css/pages/admin/admin.css", "/css/pages/admin/addcars.css"],
        errors: ["Erreur serveur lors de l'ajout"],
        vendors: await userModel.getVendors(),
        categories: await userModel.getCategories(),
        car: null,
        isEdit: false,
        formAction: "/admin/cars",
      });
    }
  },
  update: async (req, res) => {
    const carId = req.params.id;
    try {
      const {
        brand,
        model,
        year,
        price,
        mileage,
        fuel_type,
        transmission,
        vendor_id,
        category_id,
        description,
        seats,
      } = req.body;

      if (!carId || !brand || !model || !price || !vendor_id || !category_id) {
        return res.status(400).render("pages/admin/addcars", {
          title: "Modifier la voiture | VroomVTR",
          layout: "layouts/admin",
          styles: ["/css/main.css", "/css/pages/admin/admin.css", "/css/pages/admin/addcars.css"],
          errors: ["Champs obligatoires manquants"],
          vendors: await userModel.getVendors(),
          categories: await userModel.getCategories(),
          car: await userModel.getCarById(carId),
          isEdit: true,
          formAction: `/admin/cars/${carId}/update`,
        });
      }

      await userModel.updateCar(carId, {
        vendor_id,
        category_id,
        brand,
        model,
        year: year ? Number(year) : null,
        price: Number(price),
        mileage: mileage ? Number(mileage) : null,
        fuel_type,
        transmission,
        seats: seats ? Number(seats) : null,
        description,
      });

      const files = req.files || [];
      if (files.length) {
        await ensureUploadDir();
        const oldImages = await userModel.getCarImages(carId);
        await userModel.deleteCarImagesByCarId(carId);

        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const filename = `${carId}-${randomUUID()}.webp`;
          const outputPath = path.join(uploadDir, filename);

          await sharp(file.buffer)
            .resize(1200, 800, { fit: "cover", position: "center" })
            .webp({ quality: 80 })
            .toFile(outputPath);

          await userModel.addCarImage({
            car_id: carId,
            url: `/uploads/cars/${filename}`,
            is_main: i === 0,
          });
        }

        await Promise.all(oldImages.map((img) => removeLocalImageByUrl(img.url)));
      }

      return res.redirect("/admin/produit");
    } catch (err) {
      console.error("[CAR] update error:", err);
      return res.status(500).render("pages/admin/addcars", {
        title: "Modifier la voiture | VroomVTR",
        layout: "layouts/admin",
        styles: ["/css/main.css", "/css/pages/admin/admin.css", "/css/pages/admin/addcars.css"],
        errors: ["Erreur serveur lors de la modification"],
        vendors: await userModel.getVendors(),
        categories: await userModel.getCategories(),
        car: await userModel.getCarById(carId),
        isEdit: true,
        formAction: `/admin/cars/${carId}/update`,
      });
    }
  },
  delete: async (req, res) => {
    const carId = req.params.id;
    if (!carId) return res.redirect("/admin/produit");
    try {
      const images = await userModel.getCarImages(carId);
      await userModel.deleteCarById(carId);
      await Promise.all(images.map((img) => removeLocalImageByUrl(img.url)));
    } catch (err) {
      console.error("[CAR] delete error:", err);
    }
    return res.redirect("/admin/produit");
  },
};

export default carController;

