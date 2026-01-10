const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- INITIALISATION DES TABLES DE BILLETTERIE ---
const initDB = async () => {
    try {
        // Table des utilisateurs (avec adresse pour livraison des pass physiques/goodies)
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

        // Table des tickets (ID avec initiales, paiement fractionné)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                ticket_id_public TEXT UNIQUE, -- Ex: MNV-8472
                owner_telephone TEXT NOT NULL,
                event_title TEXT,
                prix_total DECIMAL(15,2),
                montant_paye DECIMAL(15,2) DEFAULT 0.00,
                statut TEXT DEFAULT 'partiel', -- 'partiel' ou 'payé'
                date_achat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Système de Billetterie prêt");
    } catch (err) { console.log("❌ Erreur initDB:", err); }
};
initDB();

// --- ROUTE : CONNEXION PROFIL ---
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (user && user.password === password) {
            // [RÈGLE : ADRESSE]
            if (!user.adresse) {
                return res.json({ status: "need_address", message: "Adresse obligatoire pour valider le profil." });
            }
            return res.json({ status: "success", user: user });
        }
        res.status(401).json({ message: "Échec connexion" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ROUTE : CRÉATION DE TICKET (Achat sans compte possible) ---
app.post('/buy-ticket', async (req, res) => {
    const { ticket_id, telephone, event_title, prix_total, acompte } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO tickets (ticket_id_public, owner_telephone, event_title, prix_total, montant_paye) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [ticket_id, telephone, event_title, prix_total, acompte]
        );
        res.json({ success: true, ticket: result.rows[0] });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// --- ROUTE : PAYER LE RESTE DU TICKET (Paiement un peu un peu) ---
app.post('/pay-partial', async (req, res) => {
    const { ticket_id, montant_verse } = req.body;
    try {
        const ticket = await pool.query('SELECT * FROM tickets WHERE ticket_id_public = $1', [ticket_id]);
        if (ticket.rows.length === 0) return res.status(404).json({ message: "Ticket non trouvé" });

        const nouveauMontant = parseFloat(ticket.rows[0].montant_paye) + parseFloat(montant_verse);
        let statut = 'partiel';
        if (nouveauMontant >= ticket.rows[0].prix_total) statut = 'payé';

        await pool.query('UPDATE tickets SET montant_paye = $1, statut = $2 WHERE ticket_id_public = $3', 
            [nouveauMontant, statut, ticket_id]);

        res.json({ success: true, nouveau_solde: nouveauMontant, statut: statut });
    } catch (e) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Billetterie active sur le port ${PORT}`));
