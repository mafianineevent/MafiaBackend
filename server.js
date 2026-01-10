const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();

app.use(cors());
app.use(express.json());

// Liaison Base de Données
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Création des tables au démarrage
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                telephone TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                username TEXT,
                adresse TEXT,
                balance DECIMAL(15,2) DEFAULT 0.00
            );
        `);
        console.log("✅ Base NineEvent prête");
    } catch (err) { console.log("❌ Erreur DB:", err); }
};
initDB();

// Route de test
app.get('/', (req, res) => res.send("MafiaBackend Billetterie en ligne !"));

// --- CONNEXION (Utilisée par ton bouton Profil) ---
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (user && user.password === password) {
            // RÈGLE : Adresse obligatoire pour les anciens
            if (!user.adresse || user.adresse.trim() === "") {
                return res.json({ status: "need_address", message: "Adresse manquante." });
            }
            return res.json({ status: "success", user: user });
        }
        res.status(401).json({ message: "Identifiants incorrects" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- INSCRIPTION (Utilisée par ton bouton Valider Profil) ---
app.post('/register', async (req, res) => {
    const { email, telephone, password, username, adresse } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO users (email, telephone, password, username, adresse) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [email, telephone, password, username, adresse]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, message: "Données déjà utilisées." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));
