const express = require('express');
const { Pool } = require('pg');
const app = express();

app.use(express.json());

// Liaison avec la base de données via la clé que tu as mise dans Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


// Route de test pour vérifier la liaison
app.get('/', (req, res) => {
  res.send("Le serveur MafiaBackend est bien lié à la base NineEvent !");
});

// Route de connexion
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (user && user.password === password) {
      // Vérification de l'adresse (indispensable pour les anciens)
      if (!user.adresse) {
        return res.json({ status: "need_address", message: "Merci d'ajouter une adresse." });
      }
      return res.json({ status: "success", user: user });
    }
    res.status(401).json({ message: "Échec connexion" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Démarrage du serveur sur le port Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
