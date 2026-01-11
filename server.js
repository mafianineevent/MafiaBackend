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
        // 1. Table Users
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                telephone TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                username TEXT,
                adresse TEXT,
                balance DECIMAL(15,2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Table Tickets (On crée si elle n'existe pas)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                ticket_id_public TEXT UNIQUE NOT NULL,
                event_name TEXT NOT NULL,
                telephone_client TEXT NOT NULL,
                prix_total DECIMAL(15,2) NOT NULL,
                montant_paye DECIMAL(15,2) DEFAULT 0.00,
                statut TEXT DEFAULT 'en_attente'
            );
        `);




         // 3. Table Coupons (Système de monnaie alternative)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS coupons (
                id SERIAL PRIMARY KEY,
                code_coupon TEXT UNIQUE NOT NULL,
                montant DECIMAL(15,2) NOT NULL,
                utilise BOOLEAN DEFAULT FALSE,
                utilise_par TEXT,
                ticket_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                used_at TIMESTAMP
            );
        `);



        

        // 3. FORCE L'AJOUT DES COLONNES SI ELLES MANQUENT (Pour le Panel Admin)
        await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
        await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'en_attente';`);
        
        console.log("✅ Base de données mise à jour et prête !");
    } catch (err) {
        console.error("❌ Erreur lors de l'initialisation DB:", err.message);
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
/* 8. PANEL ADMIN : RÉCUPÉRATION DES TICKETS                                        */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */

app.get('/admin/tickets', async (req, res) => {
    try {
        // Récupère tous les tickets du plus récent au plus ancien
        const result = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* 9. ROUTE POUR RÉCUPÉRER ET MODIFIER LES MEMBRES                                  */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */

// Pour afficher la liste des membres dans l'admin
app.get('/admin/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pour modifier le solde d'un membre
app.post('/admin/update-balance', async (req, res) => {
    const { id, balance } = req.body;
    try {
        await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [balance, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* FIN DU CODE ADMIN - LA SUITE EST TON CODE EXISTANT (Route 7 : app.listen...)    */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* ROUTE DE SUPPRESSION D'UN TICKET (ADMIN)                                         */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */

app.delete('/admin/delete-ticket/:id_public', async (req, res) => {
    const { id_public } = req.params;
    try {
        const result = await pool.query('DELETE FROM tickets WHERE ticket_id_public = $1', [id_public.toUpperCase()]);
        
        if (result.rowCount > 0) {
            res.json({ success: true, message: "Ticket supprimé avec succès." });
        } else {
            res.status(404).json({ success: false, message: "Ticket introuvable." });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});











* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* SYSTÈME DE COUPONS : CRÉATION & GESTION                                          */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */

// A. Créer un coupon (Admin)
app.post('/admin/create-coupon', async (req, res) => {
    const { montant } = req.body;
    
    if (!montant || montant <= 0) {
        return res.status(400).json({ success: false, message: "Montant invalide." });
    }
    
    // Génère un code unique comme "CPN-A1B2C"
    const code_coupon = "CPN-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    try {
        const result = await pool.query(
            'INSERT INTO coupons (code_coupon, montant) VALUES ($1, $2) RETURNING *',
            [code_coupon, montant]
        );
        res.json({ success: true, coupon: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// B. Liste de tous les coupons (Admin)
app.get('/admin/coupons', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// C. Vérifier un coupon (Client)
app.get('/coupon-status/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT code_coupon, montant, utilise FROM coupons WHERE code_coupon = $1',
            [code.toUpperCase()]
        );
        
        if (result.rows.length > 0) {
            const coupon = result.rows[0];
            
            if (coupon.utilise) {
                res.json({ 
                    success: false, 
                    message: "Ce coupon a déjà été utilisé." 
                });
            } else {
                res.json({ 
                    success: true, 
                    coupon: coupon 
                });
            }
        } else {
            res.status(404).json({ 
                success: false, 
                message: "Coupon invalide." 
            });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// D. Utiliser un coupon pour payer un ticket
app.post('/use-coupon', async (req, res) => {
    const { code_coupon, ticket_id_public } = req.body;
    
    try {
        // 1. Vérifier que le coupon existe et n'est pas utilisé
        const couponCheck = await pool.query(
            'SELECT * FROM coupons WHERE code_coupon = $1 AND utilise = FALSE',
            [code_coupon.toUpperCase()]
        );
        
        if (couponCheck.rows.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Coupon invalide ou déjà utilisé." 
            });
        }
        
        const coupon = couponCheck.rows[0];
        
        // 2. Vérifier que le ticket existe
        const ticketCheck = await pool.query(
            'SELECT * FROM tickets WHERE ticket_id_public = $1',
            [ticket_id_public.toUpperCase()]
        );
        
        if (ticketCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: "Ticket introuvable." 
            });
        }
        
        const ticket = ticketCheck.rows[0];
        const montantCoupon = parseFloat(coupon.montant);
        const prixTotal = parseFloat(ticket.prix_total);
        const montantPaye = parseFloat(ticket.montant_paye);
        const resteAPayer = prixTotal - montantPaye;
        
        // 3. Calculer le montant à appliquer (ne pas dépasser le reste à payer)
        const montantAAppliquer = Math.min(montantCoupon, resteAPayer);
        
        // 4. Mettre à jour le ticket
        await pool.query(
            'UPDATE tickets SET montant_paye = montant_paye + $1 WHERE ticket_id_public = $2',
            [montantAAppliquer, ticket_id_public.toUpperCase()]
        );
        
        // 5. Marquer le coupon comme utilisé
        await pool.query(
            'UPDATE coupons SET utilise = TRUE, utilise_par = $1, ticket_id = $2, used_at = CURRENT_TIMESTAMP WHERE code_coupon = $3',
            [ticket.telephone_client, ticket_id_public.toUpperCase(), code_coupon.toUpperCase()]
        );
        
        // 6. Vérifier si le ticket est maintenant complètement payé
        const nouveauMontant = montantPaye + montantAAppliquer;
        if (nouveauMontant >= prixTotal) {
            await pool.query(
                "UPDATE tickets SET statut = 'paye' WHERE ticket_id_public = $1",
                [ticket_id_public.toUpperCase()]
            );
        }
        
        // 7. Récupérer le ticket mis à jour
        const updatedTicket = await pool.query(
            'SELECT * FROM tickets WHERE ticket_id_public = $1',
            [ticket_id_public.toUpperCase()]
        );
        
        res.json({ 
            success: true, 
            message: `Coupon de ${montantAAppliquer.toFixed(2)} Fcfa appliqué avec succès !`,
            ticket: updatedTicket.rows[0],
            montantApplique: montantAAppliquer
        });
        
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// E. Supprimer un coupon (Admin)
app.delete('/admin/delete-coupon/:code', async (req, res) => {
    const { code } = req.params;
    
    try {
        const result = await pool.query(
            'DELETE FROM coupons WHERE code_coupon = $1',
            [code.toUpperCase()]
        );
        
        if (result.rowCount > 0) {
            res.json({ success: true, message: "Coupon supprimé avec succès." });
        } else {
            res.status(404).json({ success: false, message: "Coupon introuvable." });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
/* FIN DU CODE COUPONS                                                              */
/* XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */










// 7. Écoute sur le port Render (process.env.PORT est capital ici)
const PORT = process.env.PORT || 10000; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur actif sur le port ${PORT}`);
});
