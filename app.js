import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import expressLayouts from "express-ejs-layouts";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import { body, validationResult } from "express-validator";
import authRoutes from "./routes/routes.js";
import cookieParser from "cookie-parser";
import apiAuthRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import jwt from "jsonwebtoken";
import { resolveSessionUser } from "./utils/authSession.js";
import userModel from "./models/models.js";
// début du code
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = process.env.UPLOADS_ROOT
  ? path.resolve(process.env.UPLOADS_ROOT)
  : path.join(__dirname, "public", "uploads");
fs.mkdir(path.join(uploadsRoot, "cars"), { recursive: true }).catch((err) => {
  console.error("❌ Erreur creation dossier uploads/cars :", err);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  },
});
const DASHBOARD_UPDATE_INTERVAL_MS = 10000;
let dashboardUpdateInterval = null;
let dashboardUpdateInFlight = false;

const getAdminSocketsCount = () => {
  const room = io.sockets.adapter.rooms.get("admin");
  return room ? room.size : 0;
};

const startDashboardUpdateLoop = () => {
  if (dashboardUpdateInterval) return;
  dashboardUpdateInterval = setInterval(() => {
    emitDashboardUpdate();
  }, DASHBOARD_UPDATE_INTERVAL_MS);
};

const stopDashboardUpdateLoop = () => {
  if (!dashboardUpdateInterval) return;
  clearInterval(dashboardUpdateInterval);
  dashboardUpdateInterval = null;
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

const buildDashboardRealtimePayload = async () => {
  const stats = await userModel.getAdminDashboardStats();
  let verificationCodes = [];
  try {
    await userModel.ensureOrderVerificationCodesForPendingOrders();
    verificationCodes = await userModel.getOrderVerificationCodesForAdmin();
  } catch {
    verificationCodes = [];
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

  return {
    kpi: {
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
  };
};

const emitDashboardUpdate = async ({ force = false } = {}) => {
  if (!force && getAdminSocketsCount() === 0) return;
  if (dashboardUpdateInFlight) return;
  dashboardUpdateInFlight = true;

  try {
    const payload = await buildDashboardRealtimePayload();
    io.to("admin").emit("dashboard:update", payload);
  } catch (err) {
    console.error("[SOCKET] dashboard:update error:", err);
  } finally {
    dashboardUpdateInFlight = false;
  }
};

// Trust proxy for hosting environments using X-Forwarded-For
app.set("trust proxy", 1);

// Sécurité
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  }),
);
app.use(hpp());
app.use(express.json());
app.use(cookieParser());
// Limiteur de requêtes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limite chaque IP à 100 requêtes par fenêtre
});
app.use(limiter);

/* =======================
   MIDDLEWARES DE BASE
======================= */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* =======================
   FICHIERS STATIQUES
======================= */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsRoot));
app.get("/_uploads-check", async (req, res) => {
  const carsDir = path.join(uploadsRoot, "cars");
  const testFile = path.join(carsDir, "bm.jpg");

  let carsDirExists = false;
  let carsDirIsDir = false;
  let testFileExists = false;
  let testFileSize = null;
  let carsDirEntries = [];

  try {
    const st = await fs.stat(carsDir);
    carsDirExists = true;
    carsDirIsDir = st.isDirectory();
  } catch {
    carsDirExists = false;
  }

  try {
    const st = await fs.stat(testFile);
    testFileExists = true;
    testFileSize = st.size;
  } catch {
    testFileExists = false;
  }

  try {
    carsDirEntries = await fs.readdir(carsDir);
  } catch {
    carsDirEntries = [];
  }

  return res.json({
    uploadsRoot,
    carsDir,
    testFile,
    carsDirExists,
    carsDirIsDir,
    testFileExists,
    testFileSize,
    carsDirEntries,
  });
});

/* =======================
   EJS + LAYOUTS
======================= */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(expressLayouts);
app.set("layout", "layouts/main");

/* =======================
   USER CONTEXT
======================= */
app.use(async (req, res, next) => {
  res.locals.searchQuery = (req.query?.q || "").toString().trim();
  const user = await resolveSessionUser(req, res);
  if (!user) {
    res.locals.user = null;
    res.locals.unreadCount = 0;
    res.locals.currentOrder = null;
    return next();
  }

  res.locals.user = user;
  const [unreadCount, currentOrder] = await Promise.all([
    userModel.getUnreadCountForUser(user.id),
    userModel.getCurrentCommandeByUser(user.id),
  ]);
  res.locals.unreadCount = unreadCount;
  res.locals.currentOrder = currentOrder;
  return next();
});

/* =======================
   ROUTES
======================= */
app.use("/", authRoutes);
app.use("/auth", apiAuthRoutes);
app.use("/admin", adminRoutes);

/* =======================
   SOCKET.IO
======================= */
io.on("connection", (socket) => {
  const getUserIdFromSocket = () => {
    const cookie = socket.request.headers.cookie || "";
    const match = cookie.match(/access_token=([^;]+)/);
    if (!match) return null;
    try {
      const payload = jwt.verify(match[1], process.env.ACCESS_TOKEN_SECRET);
      return payload.sub;
    } catch {
      return null;
    }
  };

  const userId = getUserIdFromSocket();
  if (userId) {
    socket.join(`user:${userId}`);
  }

  socket.on("admin:join", () => {
    socket.join("admin");
    startDashboardUpdateLoop();
    emitDashboardUpdate({ force: true });
  });

  socket.on("user:message", (payload) => {
    (async () => {
      try {
        if (!userId || !payload?.carId) return;
        const car = await userModel.getCarById(payload.carId);
        if (!car) return;

        const convo = await userModel.getOrCreateConversation(
          userId,
          car.vendor_id,
          car.id,
        );
        await userModel.addMessage(convo.id, "user", payload.message);
        socket.emit("user:message:ack", { conversationId: convo.id });

        const user = await userModel.getUserById(userId);
        const fromName = user[0]
          ? `${user[0].first_name || ""} ${user[0].last_name || ""}`.trim()
          : payload.from || "Utilisateur";

        io.to("admin").emit("admin:message", {
          from: fromName || "Utilisateur",
          userId,
          carId: car.id,
          vendorId: car.vendor_id,
          conversationId: convo.id,
          message: payload.message,
          ts: Date.now(),
        });
        emitDashboardUpdate();
      } catch (err) {
        console.error("[SOCKET] user:message error:", err);
      }
    })();
  });

  socket.on("user:typing", (payload) => {
    (async () => {
      try {
        if (!userId || !payload?.carId) return;
        const car = await userModel.getCarById(payload.carId);
        if (!car) return;
        const convo = await userModel.getOrCreateConversation(
          userId,
          car.vendor_id,
          car.id,
        );
        io.to("admin").emit("admin:typing", {
          userId,
          conversationId: convo.id,
          typing: Boolean(payload.typing),
        });
      } catch (err) {
        console.error("[SOCKET] user:typing error:", err);
      }
    })();
  });

  socket.on("admin:message", (payload) => {
    (async () => {
      try {
        if (!payload?.userId || !payload?.message) {
          return;
        }
        const convoId = payload.conversationId;
        if (convoId) {
          await userModel.addMessage(convoId, "vendor", payload.message);
        }
        io.to(`user:${payload.userId}`).emit("vendor:message", {
          message: payload.message,
          conversationId: convoId || null,
          ts: Date.now(),
        });
        emitDashboardUpdate();
      } catch (err) {
        console.error("[SOCKET] admin:message error:", err);
      }
    })();
  });

  socket.on("admin:typing", (payload) => {
    (async () => {
      try {
        if (!payload?.userId) return;
        io.to(`user:${payload.userId}`).emit("vendor:typing", {
          typing: Boolean(payload.typing),
          conversationId: payload.conversationId || null,
        });
      } catch (err) {
        console.error("[SOCKET] admin:typing error:", err);
      }
    })();
  });

  socket.on("disconnect", () => {
    if (getAdminSocketsCount() === 0) {
      stopDashboardUpdateLoop();
    }
  });
});

// Gestionnaire d'erreur global
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  res.status(statusCode).send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Erreur</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #e74c3c;
          text-align: center;
          padding: 50px;
        }
        h1 {
          font-size: 2em;
          color: #e74c3c;
        }
        p {
          font-size: 1.2em;
        }
      </style>
    </head>
    <body>
      <h1>Une erreur est survenue</h1>
      <p>Veuillez réessayer plus tard.</p>
    </body>
    </html>
  `);
  console.log(err);
});

/* =======================
   SERVEUR
======================= */
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
