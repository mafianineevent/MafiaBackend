const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();

app.use(cors());
app.use(express.json());

// Liaison avec la base de données via la clé Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- INITIALISATION : Création de la Table & Mise à jour des Anciens ---
const initDB = async () => {
    try {
        // 1. Création de la table avec tous tes besoins
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                telephone TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                username TEXT,
                adresse TEXT,
                wallet_address TEXT UNIQUE,
                balance DECIMAL(15,2) DEFAULT 0.00,
                date_crea TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. [RÈGLE : ANCIENS] On donne une adresse wallet aux anciens qui n'en ont pas
        const anciens = await pool.query(`SELECT id FROM users WHERE wallet_address IS NULL`);
        for (let row of anciens.rows) {
            const adr = '0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
            await pool.query(`UPDATE users SET wallet_address = $1 WHERE id = $2`, [adr, row.id]);
        }
        console.log("✅ Base de données synchronisée (Users & Wallets)");
    } catch (err) { console.log("❌ Erreur initDB:", err); }
};
initDB();

// --- ROUTE : INSCRIPTION (GMAIL + TEL OBLIGATOIRE) ---
app.post('/register', async (req, res) => {
    const { email, telephone, password, username, adresse } = req.body;
    try {
        const wallet_adr = '0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
        
        const result = await pool.query(
            `INSERT INTO users (email, telephone, password, username, adresse, wallet_address) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [email, telephone, password, username, adresse, wallet_adr]
        );
        
        res.json({ success: true, user: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: "Email ou Téléphone déjà utilisé." });
    }
});

// --- ROUTE : CONNEXION ---
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (user && user.password === password) {
            // [RÈGLE : ADRESSE] Vérification indispensable
            if (!user.adresse || user.adresse.trim() === "") {
                return res.json({ status: "need_address", message: "Mise à jour requise : Merci d'ajouter une adresse." });
            }
            return res.json({ status: "success", user: user });
        }
        res.status(401).json({ message: "Identifiants incorrects" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTE : MISE À JOUR ADRESSE (POUR LES ANCIENS) ---
app.post('/update-address', async (req, res) => {
    const { email, adresse } = req.body;
    try {
        await pool.query('UPDATE users SET adresse = $1 WHERE email = $2', [adresse, email]);
        res.json({ success: true, message: "Adresse enregistrée !" });
    } catch (e) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 MafiaBackend actif sur le port ${PORT}`));
