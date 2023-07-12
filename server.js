// server.js
const express = require('express');
const knex = require('knex');
const bcrypt = require('bcrypt');
const cors = require('cors')
const nodemailer = require('nodemailer')
const dotenv = require("dotenv")
dotenv.config();

const port = 5000
const app = express();
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

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

// Register route
app.use(cors());
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, HEAD, OPTIONS, POST,PUT, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  next()
})
app.post('/register', async (req, res) => {
  const { firstName, lastName, email, username, password } = req.body;
console.log(firstName)
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

// Route for sending the confirmation email
app.post("/confirmLink", async (req, res) => {
  // console.log(req.body)
  const { email } = req.body;
  // console.log(email)
  const expiryTime = Date.now() + 60 * 1000; // Expiry time set to 24 hours from now
console.log(expiryTime)
  try {
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL, // Valid Email needed
        pass: process.env.PASS, // Valid password needed
      },
    });

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Confirmation Link",
      html: `Click the following link to reset Password: 
      <a href="https://car-rental-front.onrender.com/forgotPass?expiry=${expiryTime}">Reset Password</a>`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        res.status(404).json({ error: "Email not sent" });
        console.log(`Error:${error}`);
      } else {
        console.log(`Email sent: ${info.response}`);
        res
          .status(200)
          .json({ message: "Confirmation email sent" });
        res.status(201).json({ status: 201, info });
      }
    });
  } catch (error) {
    console.log(`Error: ${error}`);
    res.status(401).json({ status: 401, error });
  }
});

// Endpoint to handle password reset request
app.post('/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;

  try {
    // Find the user by username in the database
    const user = await db('register').where({ username }).first();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Generate a hash for the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password in the database
    await db('register')
      .where({ username })
      .update({ password: hashedPassword });

    // Send a success response
    res.json({ message: 'Password reset successful.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred during password reset.' });
  }
});

// Get image from database
app.get('/api/images/:img_name', async (req, res) => {
  try {
    const { img_name } = req.params;

    const imageData = await db.select('*')
      .from('images')
      .where('img_name', img_name)
      .first();

    if (!imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.send(imageData.img_data);
  } catch (err) {
    console.error('Error occurred fetching image:', err);
    res.status(500).json({ error: 'Error occurred fetching image' });
  }
});

//Search-User Route
// app.get("/search-username/:username", async (req, res) => {
//   const { username } = req.params;

//   try {
//     const user = await db("register").where({ username }).first();

//     if (!user) {
//       res.status(404).json({ error: "Username not found" });
//     } else {
//       res.json({ message: "Username found" });
//     }
//   } catch (error) {
//     console.error(error);
//     res
//       .status(500)
//       .json({ error: "An error occurred during username search." });
//   }
// });
