import db from "../config/config.js";
import { randomInt, randomUUID } from "crypto";

const generateVerificationCode = () => String(randomInt(100000, 1000000));

const userModel = {
  // Vérifier si un utilisateur existe par email
  getUserByEmail: async (email) => {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    return rows;
  },

  getUserById: async (id) => {
    const [rows] = await db.query("SELECT * FROM users WHERE id = ?", [id]);
    return rows;
  },

  getUserByRole: async (role) => {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE role = ? ORDER BY id ASC",
      [role],
    );
    return rows;
  },

  getAdminUsers: async () => {
    const [rows] = await db.query(
      `
      SELECT
        id,
        email,
        first_name,
        last_name,
        phone,
        country,
        city,
        is_active,
        created_at
      FROM users
      WHERE role = 'user'
      ORDER BY created_at DESC
      `,
    );
    return rows;
  },

  createUser: async ({
    email,
    password_hash,
    first_name,
    last_name,
    phone,
  }) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        email,
        password_hash,
        first_name || null,
        last_name || null,
        phone || null,
        false,
      ],
    );
    return { id, email, role: "user" };
  },

  upsertPendingUser: async ({
    email,
    password_hash,
    first_name,
    last_name,
    phone,
    verification_code,
    verification_expires,
  }) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO pending_users
       (id, email, password_hash, first_name, last_name, phone, verification_code, verification_expires)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         first_name = VALUES(first_name),
         last_name = VALUES(last_name),
         phone = VALUES(phone),
         verification_code = VALUES(verification_code),
         verification_expires = VALUES(verification_expires)`,
      [
        id,
        email,
        password_hash,
        first_name || null,
        last_name || null,
        phone || null,
        verification_code,
        verification_expires,
      ],
    );
  },

  getPendingByEmail: async (email) => {
    const [rows] = await db.query(
      "SELECT * FROM pending_users WHERE email = ?",
      [email],
    );
    return rows;
  },

  verifyPendingCode: async (email, code) => {
    const [rows] = await db.query(
      `SELECT id, email, password_hash, first_name, last_name, phone, verification_expires
       FROM pending_users
       WHERE email = ? AND verification_code = ?`,
      [email, code],
    );
    return rows;
  },

  deletePendingUser: async (email) => {
    await db.query("DELETE FROM pending_users WHERE email = ?", [email]);
  },

  updateRefreshToken: async (userId, refreshTokenHash) => {
    await db.query("UPDATE users SET refresh_token_hash = ? WHERE id = ?", [
      refreshTokenHash,
      userId,
    ]);
  },

  clearRefreshToken: async (userId) => {
    await db.query("UPDATE users SET refresh_token_hash = NULL WHERE id = ?", [
      userId,
    ]);
  },

  markVerified: async (userId) => {
    await db.query("UPDATE users SET is_active = true WHERE id = ?", [userId]);
  },

  getVendors: async () => {
    const [rows] = await db.query(
      "SELECT id, display_name FROM vendors ORDER BY display_name",
    );
    return rows;
  },

  getCategories: async () => {
    const [rows] = await db.query(
      "SELECT id, name FROM categories ORDER BY name",
    );
    return rows;
  },

  getBrands: async () => {
    const [rows] = await db.query(
      "SELECT DISTINCT brand FROM cars WHERE brand IS NOT NULL AND brand <> '' ORDER BY brand",
    );
    return rows.map((r) => r.brand);
  },

  getCars: async ({ filters, sort, page, limit }) => {
    const where = [];
    const params = [];

    if (filters.q) {
      where.push(
        "(cars.brand LIKE ? OR cars.model LIKE ? OR cars.description LIKE ?)",
      );
      params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
    }

    if (filters.category_id) {
      where.push("cars.category_id = ?");
      params.push(filters.category_id);
    }
    if (filters.brand) {
      where.push("cars.brand = ?");
      params.push(filters.brand);
    }
    if (filters.model) {
      where.push("cars.model LIKE ?");
      params.push(`%${filters.model}%`);
    }
    if (filters.fuel_type) {
      where.push("cars.fuel_type = ?");
      params.push(filters.fuel_type);
    }
    if (filters.seller_type === "entreprise") {
      where.push("vendors.is_pro = 1");
    }
    if (filters.seller_type === "particulier") {
      where.push("vendors.is_pro = 0");
    }
    if (filters.price_min) {
      where.push("cars.price >= ?");
      params.push(filters.price_min);
    }
    if (filters.price_max) {
      where.push("cars.price <= ?");
      params.push(filters.price_max);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    let orderBy = "cars.created_at DESC";
    if (sort === "price_asc") orderBy = "cars.price ASC";
    if (sort === "price_desc") orderBy = "cars.price DESC";
    if (sort === "year_desc") orderBy = "cars.year DESC";
    if (sort === "year_asc") orderBy = "cars.year ASC";

    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `
      SELECT
        cars.*,
        vendors.display_name AS vendor_name,
        vendors.avatar_url AS vendor_avatar,
        vendors.is_pro AS vendor_pro,
        categories.name AS category_name,
        (
          SELECT url
          FROM car_images
          WHERE car_images.car_id = cars.id
          ORDER BY is_main DESC, id ASC
          LIMIT 1
        ) AS main_image
      FROM cars
      JOIN vendors ON vendors.id = cars.vendor_id
      JOIN categories ON categories.id = cars.category_id
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );
    return rows;
  },

  countCars: async ({ filters }) => {
    const where = [];
    const params = [];

    if (filters.q) {
      where.push(
        "(cars.brand LIKE ? OR cars.model LIKE ? OR cars.description LIKE ?)",
      );
      params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
    }

    if (filters.category_id) {
      where.push("cars.category_id = ?");
      params.push(filters.category_id);
    }
    if (filters.brand) {
      where.push("cars.brand = ?");
      params.push(filters.brand);
    }
    if (filters.model) {
      where.push("cars.model LIKE ?");
      params.push(`%${filters.model}%`);
    }
    if (filters.fuel_type) {
      where.push("cars.fuel_type = ?");
      params.push(filters.fuel_type);
    }
    if (filters.seller_type === "entreprise") {
      where.push("vendors.is_pro = 1");
    }
    if (filters.seller_type === "particulier") {
      where.push("vendors.is_pro = 0");
    }
    if (filters.price_min) {
      where.push("cars.price >= ?");
      params.push(filters.price_min);
    }
    if (filters.price_max) {
      where.push("cars.price <= ?");
      params.push(filters.price_max);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM cars
       JOIN vendors ON vendors.id = cars.vendor_id
       ${whereSql}`,
      params,
    );
    return rows[0]?.total || 0;
  },

  getCarById: async (id) => {
    const [rows] = await db.query(
      `
      SELECT
        cars.*,
        vendors.display_name AS vendor_name,
        vendors.avatar_url AS vendor_avatar,
        vendors.is_pro AS vendor_pro,
        categories.name AS category_name
      FROM cars
      JOIN vendors ON vendors.id = cars.vendor_id
      JOIN categories ON categories.id = cars.category_id
      WHERE cars.id = ?
      LIMIT 1
      `,
      [id],
    );
    return rows[0] || null;
  },

  getConversation: async (userId, vendorId, carId) => {
    const [rows] = await db.query(
      `SELECT id FROM conversations
       WHERE user_id = ? AND vendor_id = ? AND car_id = ?
       LIMIT 1`,
      [userId, vendorId, carId],
    );
    return rows[0] || null;
  },

  createConversation: async (userId, vendorId, carId) => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO conversations (id, user_id, vendor_id, car_id) VALUES (?, ?, ?, ?)",
      [id, userId, vendorId, carId],
    );
    return { id };
  },

  getOrCreateConversation: async (userId, vendorId, carId) => {
    const existing = await userModel.getConversation(userId, vendorId, carId);
    if (existing) return existing;
    return userModel.createConversation(userId, vendorId, carId);
  },

  addMessage: async (conversationId, sender, content) => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO messages (id, conversation_id, sender, content) VALUES (?, ?, ?, ?)",
      [id, conversationId, sender, content],
    );
    return { id };
  },

  getMessages: async (conversationId) => {
    const [rows] = await db.query(
      "SELECT sender, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversationId],
    );
    return rows;
  },

  getConversationsForAdmin: async () => {
    const [rows] = await db.query(
      `
      SELECT
        conversations.id,
        conversations.user_id,
        conversations.vendor_id,
        conversations.car_id,
        conversations.admin_last_read_at,
        users.first_name,
        users.last_name,
        users.email,
        (
          SELECT COUNT(*)
          FROM messages
          WHERE messages.conversation_id = conversations.id
            AND messages.sender = 'user'
            AND messages.created_at > COALESCE(conversations.admin_last_read_at, '1970-01-01')
        ) AS unread_count,
        (
          SELECT content
          FROM messages
          WHERE messages.conversation_id = conversations.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message
      FROM conversations
      JOIN users ON users.id = conversations.user_id
      ORDER BY conversations.created_at DESC
      `,
    );
    return rows;
  },
  getConversationsForUser: async (userId) => {
    const [rows] = await db.query(
      `
      SELECT
        conversations.id,
        conversations.user_id,
        conversations.vendor_id,
        conversations.car_id,
        conversations.user_last_read_at,
        vendors.display_name AS vendor_name,
        vendors.avatar_url AS vendor_avatar,
        cars.brand,
        cars.model,
        (
          SELECT url
          FROM car_images
          WHERE car_images.car_id = cars.id
          ORDER BY is_main DESC, id ASC
          LIMIT 1
        ) AS car_image,
        (
          SELECT COUNT(*)
          FROM messages
          WHERE messages.conversation_id = conversations.id
            AND messages.sender = 'vendor'
            AND messages.created_at > COALESCE(conversations.user_last_read_at, '1970-01-01')
        ) AS unread_count,
        (
          SELECT content
          FROM messages
          WHERE messages.conversation_id = conversations.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message
      FROM conversations
      JOIN vendors ON vendors.id = conversations.vendor_id
      JOIN cars ON cars.id = conversations.car_id
      WHERE conversations.user_id = ?
      ORDER BY conversations.created_at DESC
      `,
      [userId],
    );
    return rows;
  },
  getUnreadCountForUser: async (userId) => {
    const [rows] = await db.query(
      `
      SELECT COALESCE(SUM(
        (
          SELECT COUNT(*)
          FROM messages
          WHERE messages.conversation_id = conversations.id
            AND messages.sender = 'vendor'
            AND messages.created_at > COALESCE(conversations.user_last_read_at, '1970-01-01')
        )
      ), 0) AS total
      FROM conversations
      WHERE conversations.user_id = ?
      `,
      [userId],
    );
    return rows[0]?.total || 0;
  },
  markConversationReadByUser: async (userId, conversationId) => {
    await db.query(
      "UPDATE conversations SET user_last_read_at = NOW() WHERE id = ? AND user_id = ?",
      [conversationId, userId],
    );
  },
  markConversationReadByAdmin: async (conversationId) => {
    await db.query(
      "UPDATE conversations SET admin_last_read_at = NOW() WHERE id = ?",
      [conversationId],
    );
  },
  getConversationById: async (conversationId) => {
    const [rows] = await db.query(
      `
      SELECT
        conversations.id,
        conversations.user_id,
        users.first_name,
        users.last_name,
        users.email
      FROM conversations
      JOIN users ON users.id = conversations.user_id
      WHERE conversations.id = ?
      LIMIT 1
      `,
      [conversationId],
    );
    return rows[0] || null;
  },

  getCarImages: async (carId) => {
    const [rows] = await db.query(
      "SELECT url, is_main FROM car_images WHERE car_id = ? ORDER BY is_main DESC, id ASC",
      [carId],
    );
    return rows;
  },

  getFavoriteIdsByUser: async (userId) => {
    const [rows] = await db.query(
      "SELECT car_id FROM favorites WHERE user_id = ?",
      [userId],
    );
    return rows.map((r) => r.car_id);
  },

  getFavoritesByUser: async (userId) => {
    const [rows] = await db.query(
      `
      SELECT
        cars.*,
        vendors.display_name AS vendor_name,
        vendors.avatar_url AS vendor_avatar,
        vendors.is_pro AS vendor_pro,
        (
          SELECT url
          FROM car_images
          WHERE car_images.car_id = cars.id
          ORDER BY is_main DESC, id ASC
          LIMIT 1
        ) AS main_image
      FROM favorites
      JOIN cars ON cars.id = favorites.car_id
      JOIN vendors ON vendors.id = cars.vendor_id
      WHERE favorites.user_id = ?
      ORDER BY cars.created_at DESC
      `,
      [userId],
    );
    return rows;
  },

  isFavorite: async (userId, carId) => {
    const [rows] = await db.query(
      "SELECT 1 FROM favorites WHERE user_id = ? AND car_id = ? LIMIT 1",
      [userId, carId],
    );
    return rows.length > 0;
  },

  addFavorite: async (userId, carId) => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO favorites (id, user_id, car_id) VALUES (?, ?, ?)",
      [id, userId, carId],
    );
  },

  removeFavorite: async (userId, carId) => {
    await db.query("DELETE FROM favorites WHERE user_id = ? AND car_id = ?", [
      userId,
      carId,
    ]);
  },

  createCar: async ({
    vendor_id,
    category_id,
    brand,
    model,
    year,
    price,
    mileage,
    fuel_type,
    transmission,
    seats,
    description,
  }) => {
    const id = randomUUID();
    await db.query(
      `INSERT INTO cars
       (id, vendor_id, category_id, brand, model, year, price, mileage, fuel_type, transmission, seats, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        vendor_id,
        category_id,
        brand,
        model,
        year || null,
        price,
        mileage || null,
        fuel_type || null,
        transmission || null,
        seats || null,
        description || null,
      ],
    );
    return { id };
  },

  addCarImage: async ({ car_id, url, is_main }) => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO car_images (id, car_id, url, is_main) VALUES (?, ?, ?, ?)",
      [id, car_id, url, is_main ? 1 : 0],
    );
  },

  updateCar: async (
    id,
    {
      vendor_id,
      category_id,
      brand,
      model,
      year,
      price,
      mileage,
      fuel_type,
      transmission,
      seats,
      description,
    },
  ) => {
    const [result] = await db.query(
      `UPDATE cars
       SET vendor_id = ?,
           category_id = ?,
           brand = ?,
           model = ?,
           year = ?,
           price = ?,
           mileage = ?,
           fuel_type = ?,
           transmission = ?,
           seats = ?,
           description = ?
       WHERE id = ?`,
      [
        vendor_id,
        category_id,
        brand,
        model,
        year || null,
        price,
        mileage || null,
        fuel_type || null,
        transmission || null,
        seats || null,
        description || null,
        id,
      ],
    );
    return result.affectedRows || 0;
  },

  deleteCarImagesByCarId: async (carId) => {
    await db.query("DELETE FROM car_images WHERE car_id = ?", [carId]);
  },

  deleteCarById: async (carId) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Supprime d'abord toutes les references directes a cars.id
      await conn.query("DELETE FROM commandes WHERE car_id = ?", [carId]);
      await conn.query("DELETE FROM conversations WHERE car_id = ?", [carId]);
      await conn.query("DELETE FROM favorites WHERE car_id = ?", [carId]);
      await conn.query("DELETE FROM car_images WHERE car_id = ?", [carId]);

      const [result] = await conn.query("DELETE FROM cars WHERE id = ?", [
        carId,
      ]);

      await conn.commit();
      return result.affectedRows || 0;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  updateCarStatus: async (carId, status) => {
    await db.query("UPDATE cars SET status = ? WHERE id = ?", [status, carId]);
  },

  createCommande: async ({
    user_id,
    car_id,
    vendor_id,
    amount,
    country,
    city,
    address,
    postal_code,
    payment_method,
    payment_proof_url,
  }) => {
    const id = randomUUID();
    try {
      await db.query(
        `INSERT INTO commandes
         (id, user_id, car_id, vendor_id, amount, currency, country, city, address, postal_code, payment_method, payment_proof_url, payment_status, status)
         VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
        [
          id,
          user_id,
          car_id,
          vendor_id,
          amount,
          country,
          city,
          address,
          postal_code,
          payment_method,
          payment_proof_url || null,
        ],
      );
    } catch (err) {
      if (err?.code !== "ER_BAD_FIELD_ERROR") throw err;
      await db.query(
        `INSERT INTO commandes
         (id, user_id, car_id, vendor_id, amount, currency, country, city, address, postal_code, payment_method, payment_status, status)
         VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, 'pending', 'pending')`,
        [
          id,
          user_id,
          car_id,
          vendor_id,
          amount,
          country,
          city,
          address,
          postal_code,
          payment_method,
        ],
      );
    }
    await userModel.ensureOrderVerificationCodes(id);
    return { id };
  },

  hasPendingCommandeForUserCar: async (userId, carId) => {
    const [rows] = await db.query(
      `
      SELECT id
      FROM commandes
      WHERE user_id = ?
        AND car_id = ?
        AND status = 'pending'
      LIMIT 1
      `,
      [userId, carId],
    );
    return rows[0] || null;
  },

  ensureOrderVerificationCodes: async (orderId) => {
    const [existingRows] = await db.query(
      `
      SELECT id, is_active
      FROM order_verification_codes
      WHERE order_id = ?
      LIMIT 1
      `,
      [orderId],
    );

    if (existingRows.length) {
      const existing = existingRows[0];
      if (Number(existing.is_active) === 1) {
        return existing;
      }

      const c1 = generateVerificationCode();
      await db.query(
        `
        UPDATE order_verification_codes
        SET code_step3 = ?,
            code_step4 = '',
            code_step5 = '',
            step1_verified = 0,
            step2_verified = 0,
            step3_verified = 0,
            step4_verified = 0,
            resume_step = 1,
            is_active = 1
        WHERE id = ?
        `,
        [c1, existing.id],
      );
      return { id: existing.id };
    }

    const id = randomUUID();
    const c1 = generateVerificationCode();
    await db.query(
      `
      INSERT INTO order_verification_codes
      (
        id,
        order_id,
        code_step3,
        code_step4,
        code_step5,
        step1_verified,
        step2_verified,
        step3_verified,
        step4_verified,
        resume_step,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 1, 1)
      `,
      [id, orderId, c1, "", ""],
    );

    return { id };
  },

  regenerateOrderVerificationCodes: async (orderId) => {
    const [existingRows] = await db.query(
      `
      SELECT id
      FROM order_verification_codes
      WHERE order_id = ?
      LIMIT 1
      `,
      [orderId],
    );

    const c1 = generateVerificationCode();

    if (existingRows.length) {
      await db.query(
        `
        UPDATE order_verification_codes
        SET code_step3 = ?,
            code_step4 = '',
            code_step5 = '',
            step1_verified = 0,
            step2_verified = 0,
            step3_verified = 0,
            step4_verified = 0,
            resume_step = 1,
            is_active = 1
        WHERE order_id = ?
        `,
        [c1, orderId],
      );
      return existingRows[0];
    }

    const id = randomUUID();
    await db.query(
      `
      INSERT INTO order_verification_codes
      (
        id,
        order_id,
        code_step3,
        code_step4,
        code_step5,
        step1_verified,
        step2_verified,
        step3_verified,
        step4_verified,
        resume_step,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 1, 1)
      `,
      [id, orderId, c1, "", ""],
    );

    return { id };
  },

  ensureOrderVerificationCodesForPendingOrders: async () => {
    const [rows] = await db.query(
      `
      SELECT commandes.id AS order_id
      FROM commandes
      LEFT JOIN order_verification_codes
        ON order_verification_codes.order_id = commandes.id
      WHERE commandes.status = 'pending'
        AND order_verification_codes.id IS NULL
      `,
    );

    for (const row of rows) {
      await userModel.ensureOrderVerificationCodes(row.order_id);
    }

    return rows.length;
  },

  getOrderVerificationCodesForAdmin: async () => {
    const [rows] = await db.query(
      `
      SELECT
        ov.order_id,
        ov.code_step3,
        ov.code_step4,
        ov.code_step5,
        ov.resume_step,
        ov.created_at,
        c.status AS order_status,
        c.created_at AS order_created_at,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name,
        u.email AS user_email,
        cars.brand,
        cars.model,
        cars.year
      FROM order_verification_codes ov
      JOIN commandes c ON c.id = ov.order_id
      JOIN users u ON u.id = c.user_id
      JOIN cars ON cars.id = c.car_id
      WHERE ov.is_active = 1
        AND c.status = 'pending'
      ORDER BY c.created_at DESC
      `,
    );
    return rows;
  },

  getOrderVerificationState: async (orderId) => {
    const [rows] = await db.query(
      `
      SELECT
        code_step3,
        code_step4,
        code_step5,
        step1_verified,
        step2_verified,
        step3_verified,
        step4_verified,
        resume_step,
        is_active
      FROM order_verification_codes
      WHERE order_id = ?
      LIMIT 1
      `,
      [orderId],
    );

    const row = rows[0];
    if (!row) {
      return {
        exists: false,
        step1_verified: false,
        step2_verified: false,
        step3_verified: false,
        step4_verified: false,
        resume_step: 1,
      };
    }

    return {
      exists: true,
      code_step3: row.code_step3 || "",
      code_step4: row.code_step4 || "",
      code_step5: row.code_step5 || "",
      step1_verified: Number(row.step1_verified) === 1,
      step2_verified: Number(row.step2_verified) === 1,
      step3_verified: Number(row.step3_verified) === 1,
      step4_verified: Number(row.step4_verified) === 1,
      resume_step: Math.max(1, Math.min(5, Number(row.resume_step || 1))),
      is_active: Number(row.is_active) === 1,
    };
  },

  markRefundStep1Verified: async (orderId) => {
    await db.query(
      `
      UPDATE order_verification_codes
      SET step1_verified = 1,
          resume_step = IF(resume_step < 2, 2, resume_step)
      WHERE order_id = ? AND is_active = 1
      `,
      [orderId],
    );
  },

  markRefundStep2Verified: async (orderId) => {
    await db.query(
      `
      UPDATE order_verification_codes
      SET step2_verified = 1,
          resume_step = IF(resume_step < 3, 3, resume_step)
      WHERE order_id = ? AND is_active = 1
      `,
      [orderId],
    );
  },

  verifyOrderCodes: async ({ orderId, step3, step4, step5 }) => {
    const [rows] = await db.query(
      `
      SELECT code_step3, code_step4, code_step5
      FROM order_verification_codes
      WHERE order_id = ? AND is_active = 1
      LIMIT 1
      `,
      [orderId],
    );

    const row = rows[0];
    if (!row) {
      return {
        exists: false,
        step3Ok: false,
        step4Ok: false,
        step5Ok: false,
      };
    }

    return {
      exists: true,
      step3Ok: String(row.code_step3) === String(step3),
      step4Ok: String(row.code_step4) === String(step4),
      step5Ok: String(row.code_step5) === String(step5),
    };
  },

  validateAndAdvanceRefundStep3: async (orderId, step3) => {
    const [rows] = await db.query(
      `
      SELECT code_step3, code_step4, code_step5, is_active, step2_verified
      FROM order_verification_codes
      WHERE order_id = ?
      LIMIT 1
      `,
      [orderId],
    );

    const row = rows[0];
    if (!row || Number(row.is_active) !== 1) {
      return { ok: false, message: "Codes admin indisponibles." };
    }

    if (Number(row.step2_verified) !== 1) {
      return { ok: false, message: "Validez d'abord l'etape 2." };
    }

    if (String(row.code_step3) !== String(step3)) {
      return { ok: false, message: "Etape 3: code incorrect." };
    }

    if (!row.code_step4) {
      let code4 = generateVerificationCode();
      while (String(code4) === String(row.code_step3)) {
        code4 = generateVerificationCode();
      }
      await db.query(
        `
        UPDATE order_verification_codes
        SET code_step4 = ?
        WHERE order_id = ?
        `,
        [code4, orderId],
      );
    }

    await db.query(
      `
      UPDATE order_verification_codes
      SET step3_verified = 1,
          resume_step = IF(resume_step < 4, 4, resume_step)
      WHERE order_id = ?
      `,
      [orderId],
    );

    return { ok: true };
  },

  validateAndAdvanceRefundStep4: async (orderId, step4) => {
    const [rows] = await db.query(
      `
      SELECT code_step3, code_step4, code_step5, is_active, step3_verified
      FROM order_verification_codes
      WHERE order_id = ?
      LIMIT 1
      `,
      [orderId],
    );

    const row = rows[0];
    if (!row || Number(row.is_active) !== 1) {
      return { ok: false, message: "Codes admin indisponibles." };
    }

    if (Number(row.step3_verified) !== 1) {
      return { ok: false, message: "Validez d'abord l'etape 3." };
    }

    if (!row.code_step4) {
      return {
        ok: false,
        message: "Code #2 non genere. Validez d'abord l'etape 3.",
      };
    }

    if (String(row.code_step4) !== String(step4)) {
      return { ok: false, message: "Etape 4: code incorrect." };
    }

    if (!row.code_step5) {
      let code5 = generateVerificationCode();
      while (
        String(code5) === String(row.code_step3) ||
        String(code5) === String(row.code_step4)
      ) {
        code5 = generateVerificationCode();
      }
      await db.query(
        `
        UPDATE order_verification_codes
        SET code_step5 = ?
        WHERE order_id = ?
        `,
        [code5, orderId],
      );
    }

    await db.query(
      `
      UPDATE order_verification_codes
      SET step4_verified = 1,
          resume_step = IF(resume_step < 5, 5, resume_step)
      WHERE order_id = ?
      `,
      [orderId],
    );

    return { ok: true };
  },

  deactivateOrderVerificationCodes: async (orderId) => {
    await db.query(
      `
      UPDATE order_verification_codes
      SET is_active = 0,
          resume_step = 1
      WHERE order_id = ?
      `,
      [orderId],
    );
  },

  getCurrentCommandeByUser: async (userId) => {
    const [rows] = await db.query(
      `
      SELECT
        commandes.id,
        commandes.amount,
        commandes.currency,
        commandes.status,
        commandes.payment_status,
        commandes.created_at,
        cars.brand,
        cars.model
      FROM commandes
      JOIN cars ON cars.id = commandes.car_id
      WHERE commandes.user_id = ?
        AND commandes.status = 'pending'
      ORDER BY commandes.created_at DESC
      LIMIT 1
      `,
      [userId],
    );
    return rows[0] || null;
  },

  getAllCommandesForAdmin: async () => {
    const [rows] = await db.query(
      `
      SELECT
        commandes.id,
        commandes.user_id,
        commandes.car_id,
        commandes.vendor_id,
        commandes.amount,
        commandes.currency,
        commandes.country,
        commandes.city,
        commandes.address,
        commandes.postal_code,
        commandes.payment_method,
        commandes.payment_status,
        commandes.status,
        commandes.created_at,
        commandes.updated_at,
        users.first_name AS user_first_name,
        users.last_name AS user_last_name,
        users.email AS user_email,
        cars.brand,
        cars.model,
        cars.year,
        vendors.display_name AS vendor_name
      FROM commandes
      JOIN users ON users.id = commandes.user_id
      JOIN cars ON cars.id = commandes.car_id
      JOIN vendors ON vendors.id = commandes.vendor_id
      ORDER BY commandes.created_at DESC
      `,
    );
    return rows;
  },

  getAdminDashboardStats: async () => {
    const [
      salesTodayRows,
      pendingRows,
      unreadRows,
      activeUsersRows,
      totalOrdersRows,
      confirmedOrdersRows,
      repliedConversationsRows,
      totalConversationsRows,
      recentRows,
    ] = await Promise.all([
      db.query(
        `
        SELECT COUNT(*) AS total
        FROM commandes
        WHERE DATE(created_at) = CURDATE()
          AND status = 'confirmed'
        `,
      ),
      db.query(
        `
        SELECT COUNT(*) AS total
        FROM commandes
        WHERE status = 'pending'
        `,
      ),
      db.query(
        `
        SELECT COALESCE(SUM(
          (
            SELECT COUNT(*)
            FROM messages
            WHERE messages.conversation_id = conversations.id
              AND messages.sender = 'user'
              AND messages.created_at > COALESCE(conversations.admin_last_read_at, '1970-01-01')
          )
        ), 0) AS total
        FROM conversations
        `,
      ),
      db.query(
        `
        SELECT COUNT(*) AS total
        FROM users
        WHERE role = 'user' AND is_active = 1
        `,
      ),
      db.query(`SELECT COUNT(*) AS total FROM commandes`),
      db.query(
        `
        SELECT COUNT(*) AS total
        FROM commandes
        WHERE status = 'confirmed'
        `,
      ),
      db.query(
        `
        SELECT COUNT(DISTINCT conversation_id) AS total
        FROM messages
        WHERE sender = 'vendor'
        `,
      ),
      db.query(`SELECT COUNT(*) AS total FROM conversations`),
      db.query(
        `
        SELECT *
        FROM (
          SELECT created_at, 'order' AS kind, id AS ref_id, status AS detail
          FROM commandes
          UNION ALL
          SELECT created_at, 'car' AS kind, id AS ref_id, NULL AS detail
          FROM cars
          UNION ALL
          SELECT created_at, 'user' AS kind, id AS ref_id, NULL AS detail
          FROM users
          WHERE role = 'user'
        ) AS events
        ORDER BY created_at DESC
        LIMIT 8
        `,
      ),
    ]);

    const salesToday = salesTodayRows[0][0]?.total || 0;
    const pendingOrders = pendingRows[0][0]?.total || 0;
    const unreadMessages = unreadRows[0][0]?.total || 0;
    const activeUsers = activeUsersRows[0][0]?.total || 0;
    const totalOrders = totalOrdersRows[0][0]?.total || 0;
    const confirmedOrders = confirmedOrdersRows[0][0]?.total || 0;
    const repliedConversations = repliedConversationsRows[0][0]?.total || 0;
    const totalConversations = totalConversationsRows[0][0]?.total || 0;
    const recentActivity = recentRows[0] || [];

    const conversionRate = totalOrders
      ? Math.round((confirmedOrders / totalOrders) * 100)
      : 0;
    const supportRate = totalConversations
      ? Math.round((repliedConversations / totalConversations) * 100)
      : 0;

    return {
      salesToday,
      pendingOrders,
      unreadMessages,
      activeUsers,
      conversionRate,
      supportRate,
      uptimeRate: 99.9,
      recentActivity,
    };
  },

  confirmCommandeByUser: async (orderId, userId) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [orderRows] = await conn.query(
        `
        SELECT id, car_id
        FROM commandes
        WHERE id = ?
          AND user_id = ?
          AND status = 'pending'
        LIMIT 1
        FOR UPDATE
        `,
        [orderId, userId],
      );
      const order = orderRows[0];
      if (!order) {
        await conn.rollback();
        return 0;
      }

      const [confirmResult] = await conn.query(
        `
        UPDATE commandes
        SET status = 'confirmed'
        WHERE id = ?
          AND user_id = ?
          AND status = 'pending'
        `,
        [orderId, userId],
      );
      if (!(confirmResult.affectedRows || 0)) {
        await conn.rollback();
        return 0;
      }

      await conn.commit();
      return confirmResult.affectedRows || 0;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  getCommandeByIdForUser: async (orderId, userId) => {
    const [rows] = await db.query(
      `
      SELECT
        commandes.id,
        commandes.user_id,
        commandes.car_id,
        commandes.amount,
        commandes.currency,
        commandes.status,
        commandes.created_at,
        cars.brand,
        cars.model,
        cars.year
      FROM commandes
      JOIN cars ON cars.id = commandes.car_id
      WHERE commandes.id = ?
        AND commandes.user_id = ?
      LIMIT 1
      `,
      [orderId, userId],
    );
    return rows[0] || null;
  },

  refundCommandeByUser: async (orderId, userId) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `
        SELECT car_id, status
        FROM commandes
        WHERE id = ? AND user_id = ?
        LIMIT 1
        `,
        [orderId, userId],
      );

      const order = rows[0];
      if (!order || order.status !== "pending") {
        await conn.rollback();
        return 0;
      }

      const [result] = await conn.query(
        `
        UPDATE commandes
        SET status = 'cancelled',
            payment_status = 'refunded'
        WHERE id = ? AND user_id = ? AND status = 'pending'
        `,
        [orderId, userId],
      );

      if (!(result.affectedRows || 0)) {
        await conn.rollback();
        return 0;
      }

      await conn.commit();
      return result.affectedRows || 0;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
};

export default userModel;
