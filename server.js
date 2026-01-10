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
// 3. Initialisation des Tables (Users & Tickets)
const initDB = async () => {
    try {
        // Table existante
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

        // NOUVELLE TABLE : C'est elle qui permet le "petit à petit"
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                ticket_id_public TEXT UNIQUE NOT NULL, -- L'ID que le client va noter
                event_name TEXT NOT NULL,
                telephone_client TEXT NOT NULL,
                prix_total DECIMAL(15,2) NOT NULL,
                montant_paye DECIMAL(15,2) DEFAULT 0.00,
                statut TEXT DEFAULT 'en_attente'
            );
        `);


        
        console.log("✅ Tables prêtes (Users + Tickets)");
    } catch (err) {
        console.error("❌ Erreur DB:", err);
    }
};
initDB(); 





// 4. Route de test (Vérifie si le serveur est en vie)
app.get('/', (req, res) => res.send("MafiaBackend Billetterie en ligne !"));





// A. Route de création du ticket (Achat rapide)
app.post('/quick-buy', async (req, res) => {
    const { event_name, telephone, prix_total } = req.body;
    // Génère un ID unique comme "9E-A1B2C"
    const ticket_id_public = "9E-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
        const result = await pool.query(
            'INSERT INTO tickets (ticket_id_public, event_name, telephone_client, prix_total) VALUES ($1, $2, $3, $4) RETURNING *',
            [ticket_id_public, event_name, telephone, prix_total]
        );
        res.json({ success: true, ticket: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});



/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* ROUTE DE RÉCUPÉRATION DU STATUT D'UN TICKET (POUR LA RECHERCHE)                  */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */

app.get('/ticket-status/:id_public', async (req, res) => {
    const { id_public } = req.params;

    try {
        // On cherche le ticket dans la table par son ID public (ex: 9E-A1B2C)
        const result = await pool.query(
            'SELECT ticket_id_public, event_name, telephone_client, prix_total, montant_paye, statut FROM tickets WHERE ticket_id_public = $1',
            [id_public.toUpperCase()] // On force la majuscule pour éviter les erreurs de saisie
        );

        if (result.rows.length > 0) {
            // Si le ticket existe, on le renvoie au client
            res.json({ 
                success: true, 
                ticket: result.rows[0] 
            });
        } else {
            // Si rien n'est trouvé
            res.status(404).json({ 
                success: false, 
                message: "Aucun ticket trouvé avec cet ID." 
            });
        }
    } catch (err) {
        console.error("Erreur lors de la recherche du ticket:", err);
        res.status(500).json({ 
            success: false, 
            error: "Erreur interne du serveur." 
        });
    }
});



// B. Route de paiement partiel par ID
app.post('/pay-partial', async (req, res) => {
    const { ticket_id_public, montant } = req.body;
    try {
        const result = await pool.query(
            'UPDATE tickets SET montant_paye = montant_paye + $1 WHERE ticket_id_public = $2 RETURNING *',
            [montant, ticket_id_public]
        );
        
        const ticket = result.rows[0];
        if (ticket.montant_paye >= ticket.prix_total) {
            await pool.query("UPDATE tickets SET statut = 'paye' WHERE ticket_id_public = $1", [ticket_id_public]);
        }
        
        res.json({ success: true, ticket: ticket });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});






/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* 8. PANEL ADMIN : RÉCUPÉRATION SANS CLÉ (MISE À JOUR)                             */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */




/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* 9. ROUTE POUR MODIFIER LE SOLDE D'UN MEMBRE                                      */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */


/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* FIN DU CODE ADMIN - LA SUITE EST TON CODE EXISTANT (Route 7 : app.listen...)    */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */







// 7. Écoute sur le port Render (process.env.PORT est capital ici)
const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur le port ${PORT}`);
});
