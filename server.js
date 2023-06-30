// server.js
const express = require('express');
const knex = require('knex');
const bcrypt = require('bcrypt');

const app = express();
const port = 5000

// Initialize Knex with PostgreSQL database configuration
const db = knex({
  client: 'pg',
  connection: {
    host: process.env.db_host,
    user: process.env.db_user,
    password: process.env.db_password,
    database: process.env.db_DB,
  }
});

// Middleware to parse JSON body
app.use(express.json());
// app.use(express.static('public'));
// app.all('*', (req, res) => {
//   res.send("<h1>404 Page not found</h1>") } )
// Register route
app.post('/register', async (req, res) => {
  const { firstName, lastName, email, username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const registeredUser = await db('register').insert({
      first_name: firstName,
      last_name: lastName,
      email,
      username,
      password: hashedPassword,
      created_date: new Date().toISOString(),
      last_login: null
    });

    res.json({ message: '👍 REGISTRATION SUCCESSFUL' });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: '✖ EMAIL ALREADY EXISTS' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'An error occurred during registration.' });
    }
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await db('register').where({ username }).first();

    if (!user) {
      res.status(401).json({ error: '✖ USERNAME NOT FOUND' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      res.status(401).json({ error: '✖ INCORRECT PASSWORD' });
      return;
    }

    await db('login').insert({
      username,
      password: user.password
    });

    res.json({ message: '👍 LOGIN SUCCESSFUL' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});