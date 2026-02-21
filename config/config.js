import mysql from "mysql2/promise";

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 10000,
});

// Vérification de la connexion
(async () => {
  try {
    const conn = await db.getConnection();
    console.log("✅ Connexion à la base de données MySQL réussie !");
    conn.release();
  } catch (err) {
    console.error("❌ Erreur de connexion à MySQL :", err);
  }
})();

export default db;
