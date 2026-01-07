
/* Fichier principal du serveur NineEvent 
  Gère la liaison entre GitHub, Render et PostgreSQL
*/
const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(express.json());

// Liaison sécurisée via la variable DATABASE_URL configurée sur Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ROUTE DE CONNEXION
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (user && user.password === password) {
      // REGLE : Vérification de l'adresse pour les anciens utilisateurs
      if (!user.adresse) {
        return res.status(200).json({ 
          status: "need_update", 
          message: "Ancien compte : merci de renseigner votre adresse." 
        });
      }
      res.json({ status: "success", user: user });
    } else {
      res.status(401).json({ message: "Identifiants invalides" });
    }
  } catch (err) {
    res.status(500).json({ error: "Erreur de liaison avec la base" });
  }
});

// Le serveur écoute sur le port fourni par Render
app.listen(process.env.PORT || 3000, () => {
  console.log("Serveur NineEvent opérationnel");
});
