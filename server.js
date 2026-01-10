/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* MAFIABACKEND : SERVEUR DE BILLETTERIE (STABLE POUR RENDER)                       */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// 1. Activation de CORS pour autoriser ton site à parler au serveur
app.use(cors());
app.use(express.json());

// 2. Configuration PostgreSQL avec SSL forcé pour Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Indispensable pour éviter l'erreur de certificat sur Render
    }
});

// 3. Initialisation de la Table Users (Billetterie)
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
        console.log("✅ Base NineEvent connectée et table prête");
    } catch (err) {
        console.error("❌ Erreur lors de l'initialisation DB:", err);
    }
};
initDB();

// 4. Route de test (Vérifie si le serveur est en vie)
app.get('/', (req, res) => res.send("MafiaBackend Billetterie en ligne !"));

// 5. Route CONNEXION (Gère le cas de l'adresse manquante pour les anciens)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (user && user.password === password) {
            // [RÈGLE] Vérification obligatoire de l'adresse
            if (!user.adresse || user.adresse.trim() === "") {
                return res.json({ status: "need_address", message: "Adresse manquante." });
            }
            return res.json({ status: "success", user: user });
        }
        res.status(401).json({ message: "Identifiants incorrects" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Route INSCRIPTION
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
        res.status(500).json({ success: false, message: "Email ou Téléphone déjà utilisé." });
    }
});





/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* 8. PANEL ADMIN : RÉCUPÉRATION SANS CLÉ (MISE À JOUR)                             */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */

app.get('/admin/users', async (req, res) => {
    try {
        // On récupère les membres directement
        const result = await pool.query('SELECT id, username, email, telephone, adresse, balance FROM users ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error("Erreur Admin:", err);
        res.status(500).json({ error: "Erreur lors de la récupération des membres" });
    }
});

/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* FIN DU CODE ADMIN - LA SUITE EST TON CODE EXISTANT (Route 7 : app.listen...)    */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */







// 7. Écoute sur le port Render (process.env.PORT est capital ici)
const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur le port ${PORT}`);
});
