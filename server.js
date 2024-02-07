// server.js
const express = require("express");
const knex = require("knex");
const bcrypt = require("bcrypt");
const cors = require("cors");
const nodemailer = require("nodemailer");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { auth } = require("express-openid-connect");


const dotenv = require("dotenv");
dotenv.config();

const port = 5000;
const app = express();
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const JWTSecretKey = process.env.AUTH0_SECRET_KEY
const users = [];

//cloudinary setup
cloudinary.config({
  cloud_name: process.env.RENDER_CLOUDINARY_NAME,
  api_key: process.env.RENDER_CLOUDINARY_API_KEY,
  api_secret: process.env.RENDER_CLOUDINARY_API_SECRET,
});

// Initialize Knex with PostgreSQL database configuration
const db = knex({
  client: "pg",
  connection: {
    host: process.env.RENDER_HOST,
    user: process.env.RENDER_USER,
    password: process.env.RENDER_PASS,
    database: process.env.RENDER_DB,
    ssl: true, 
    // port: process.env.DB_LOCAL_PORT,
  },
});

//Auth0 setup
const config = {
  authRequired: false,
  auth0Logout: true,
  // baseURL: 'http://localhost:3000',
  baseURL: "https://car-rental-front.onrender.com",
  clientID: process.env.RENDER_AUTH0_CLIENT_ID,
  issuerBaseURL: 'https://dev-tii6oqkuei5k4hbn.us.auth0.com',
  secret: process.env.RENDER_AUTH0_SECRET_KEY
};

//CORS
app.use(cors({ 
  origin: "https://car-rental-front.onrender.com",
  // origin: "http://localhost:3000",  
  credentials: true,
}));

// Middleware to parse JSON body
app.use(express.json());
app.use(cookieParser())
app.use(auth(config))
const upload = multer({ dest: "uploads/" });
const authMiddleware = require("./authMiddleware");

//-----------------------------------------------------------------------------------------//

//Manual cors
// app.use(function (req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header(
//     "Access-Control-Allow-Methods",
//     "GET, HEAD, OPTIONS, POST,PUT, DELETE"
//   );
//   res.header(
//     "Access-Control-Allow-Headers",
//     "Origin, X-Requested-With, Content-Type, Accept, Authorization"
//   );
//   res.header('Access-Control-Allow-Credentials', 'true');
//   next();
// });

//-------------------------------------------------------------------------------------------//

//Protect_Routes
app.get("/", (req, res) => {
  res.send(
    req.oidc.isAuthenticated() ? "Logged in" : "Logged out"
  )
})

// Protected route that requires authentication
app.get('/profile', authMiddleware, (req, res) => {
  // Access the authenticated user's information via req.user
  res.json({ message: `Welcome, ${req.user.username}!` });
});

//--------------------------------------------------------------------------------------------//

// Register route
app.post("/register", async (req, res) => {
  const { firstName, lastName, email, username, password } = req.body;
  // console.log(firstName)
  try {

    const hashedPassword = await bcrypt.hash(password, 10);
    // Create a new user
    const newUser = { id: users.length + 1, username, password: hashedPassword }
    users.push(newUser)

    // Generate a JWT for the new user
    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWTSecretKey, {
    expiresIn: '1h', // Token expires in 1 hour
    });

    await db("register").insert({
      first_name: firstName,
      last_name: lastName,
      email,
      username,
      password: hashedPassword,
      created_date: new Date().toISOString(),
      // last_login: null,
    });

    res.cookie("token", token, { httpOnly: true})
    res.status(200).json({ message: "REGISTRATION SUCCESSFUL", token });
  } catch (error) {
    if (error.code === "23505") {
      res.status(400).json({ error: "✖ EMAIL ALREADY EXISTS" });
    } else {
      console.error(error);
      res.status(500).json({ error: "An error occurred during registration." });
    }
  }
});

// Login route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await db("register").where({ username }).first();

    if (!user) {
      res.status(401).json({ error: "✖ USERNAME NOT FOUND" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      res.status(401).json({ error: "✖ INCORRECT PASSWORD" });
      return;
    }

    await db("login").insert({
      username,
      password: user.password,
    });

    // Generate a JWT for the authenticated user
    const token = jwt.sign({ id: user.id, username: user.username }, JWTSecretKey, {
      expiresIn: '1h', // Token expires in 1 hour
    });
    // console.log(jwt.decode(token));
    // Set the JWT as an HTTP cookie
    res.cookie('token', token, { httpOnly: true });
    res.status(200).json({ message: "LOGIN SUCCESSFUL", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred during login." });
  }
});

// logout route
app.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logout Successful"})
})

// Route for sending the confirmation email
app.post("/confirmLink", async (req, res) => {
  // console.log(req.body)
  const { email } = req.body;
  // console.log(email)
  const expiryTime = Date.now() + 60 * 1000; // Expiry time set to 24 hours from now
  console.log(expiryTime);
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
        res.status(200).json({ message: "Confirmation email sent" });
        res.status(201).json({ status: 201, info });
      }
    });
  } catch (error) {
    console.log(`Error: ${error}`);
    res.status(401).json({ status: 401, error });
  }
});

// Endpoint to handle password reset request
app.post("/reset-password", async (req, res) => {
  const { username, newPassword } = req.body;

  try {
    // Find the user by username in the database
    const user = await db("register").where({ username }).first();

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Generate a hash for the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password in the database
    await db("register")
      .where({ username })
      .update({ password: hashedPassword });

    // Send a success response
    res.json({ message: "Password reset successful." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred during password reset." });
  }
});

//--------------OWNER_RENTING_THEIR_CAR_ROUTE---------------//
app.post("/owner-data", upload.array("images", 5), async (req, res) => {
  const { carName, price, rent, username } = req.body;

  try {
    // const userID = req.userId;

    // Assuming you have a function to retrieve the user ID from the username
    const user = await db("register").where({ username }).first();
    // console.log(user)
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const imageURLS = await Promise.all(
      req.files.map(async (file) => {
        const result = await cloudinary.uploader.upload(file.path);
        return result.secure_url;
      })
    );

    // Convert the array of image URLs to a JSON string
    const imageUrlsJson = JSON.stringify(imageURLS);

    await db("car_listings").insert({
      car_name: carName,
      price: price,
      rent: rent,
      image_url: imageUrlsJson,
      login_user_name: user.username,
    });

    res.status(200).json({ message: "Data saved!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred saving data" });
  }
});

app.get("/api/car-data", async (req, res) => {
  try {
    // Fetch all records from the car_listings table
    const carListings = await db('car_listings').select('*');
    // console.log('Fetched car listings:', carListings);

    res.json(carListings);
  } catch (err) {
    console.error('Error occurred fetching data:', err);
    res.status(500).json({ error: 'Error occurred fetching data' });
  }
});