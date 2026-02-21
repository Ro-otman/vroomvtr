import express from "express";
import carController from "../controllers/carController.js";
import adminAuthController from "../controllers/adminAuthController.js";
import requireAdmin from "../middleware/requireAdmin.js";
import upload from "../middleware/uploadCarImages.js";

const router = express.Router();

router.get("/login", adminAuthController.renderLogin);
router.post("/login", adminAuthController.login);
router.post("/logout", adminAuthController.logout);
router.get("/logout", adminAuthController.logout);

router.use(requireAdmin);

router.get("/dashboard", carController.renderAdminDashboard);

router.get("/produit", carController.renderAdminProducts);

router.get("/addcars", carController.renderAddCars);
router.get("/addcars/:id/edit", carController.renderAddCars);
router.post("/cars", upload.array("images", 10), carController.create);
router.post("/cars/:id/update", upload.array("images", 10), carController.update);
router.post("/cars/:id/delete", carController.delete);

router.get("/orders", carController.renderAdminOrders);

router.get("/messages", carController.renderAdminMessages);
router.get("/messages/:id", carController.getAdminMessagesData);

router.get("/users", carController.renderAdminUsers);

export default router;
