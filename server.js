import express from 'express';
// import knex from 'knex';
import bcrypt from 'bcrypt';
import cors from 'cors';
import nodemailer from 'nodemailer';
import multer from 'multer';
import cloudinary from 'cloudinary';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { auth } from 'express-openid-connect';
import dotenv from 'dotenv';
import authMiddleware from "./authMiddleware.js"
import { initializeApp } from "firebase/app";
import { getDocs, getFirestore, collection, addDoc, query, where, updateDoc } from 'firebase/firestore';
import admin from "firebase-admin";

dotenv.config();

const port = 5000;
const app = express();
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const JWTSecretKey = process.env.AUTH0_SECRET_KEY || process.env.RENDER_AUTH0_SECRET_KEY
const users = [];

//CLOUDINARY CONFIG
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME || process.env.RENDER_CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY || process.env.RENDER_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET || process.env.RENDER_CLOUDINARY_API_SECRET,
});

//FIREBASE DATABASE CONFIG
const firebaseConfig = {
  apiKey: process.env.FIREBASE_APIKEY || process.env.RENDER_FIREBASE_APIKEY,
  authDomain: process.env.FIREBASE_AUTHDOMAIN || process.env.RENDER_FIREBASE_AUTHDOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.RENDER_FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.RENDER_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.RENDER_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID || process.env.RENDER_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || process.env.RENDER_FIREBASE_MEASUREMENT_ID
};

initializeApp(firebaseConfig)
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS || process.env.RENDER_FIREBASE_CREDENTIALS)),
});
const firebaseDB = getFirestore();
//FIREBASE "register_user" COLLECTION
const registerRef = collection(firebaseDB, 'register_user');
//FIREBASE "login_account" COLLECTION
const loginRef = collection(firebaseDB, 'login_account');
//FIREBASE "owners_car_data" COLLECTION
const ownerDataRef = collection(firebaseDB, 'owners_car_data');

//------------POSTGRESQL DATABASE CONNECTION------------//
// const db = knex({
//   client: "pg",
//   connection: {
//     host: process.env.DB_LOCAL_HOST,
//     user: process.env.DB_LOCAL_USER,
//     password: process.env.DB_LOCAL_PASS,
//     database: process.env.DB_LOCAL_DB,
//     // ssl: true,
//     port: process.env.DB_LOCAL_PORT,
//   },
// });
//------------POSTGRESQL DATABASE CONNECTION------------//

// AUTH0 SETUP
const config = {
  authRequired: false,
  auth0Logout: true,
  baseURL: process.env.LOCAL_URL || process.env.RENDER_URL,
  clientID: process.env.AUTH0_CLIENT_ID || process.env.RENDER_AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUE_BASE_URL || process.env.RENDER_AUTH0_ISSUE_BASE_URL,
  secret: process.env.AUTH0_SECRET_KEY || process.env.RENDER_AUTH0_SECRET_KEY
};

// CORS
app.use(cors({
  origin: process.env.LOCAL_URL || process.env.RENDER_URL,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser())
app.use(auth(config))
const upload = multer({ dest: "uploads/" });

//-------------------------------MANUAL CORS-------------------------------//
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
//-------------------------------MANUAL CORS-------------------------------//

//--------------PROTECT ROUTE(FOR TESTING)--------------//

// PROTECT ROUTES
app.get("/", (req, res) => {
  res.send(
    req.oidc.isAuthenticated() ? "Logged in" : "Logged out"
  )
})

// PROTECTED ROUTE THAT REQUIRES AUTHENTICATION
app.get('/profile', authMiddleware, (req, res) => {
  // Access the authenticated user's information via req.user
  res.json({ message: `Welcome, ${req.user.username}!` });
});
//--------------PROTECT ROUTE(FOR TESTING)--------------//

// REGISTER ROUTE
app.post("/api/register", async (req, res) => {
  const { fullName, email, username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = { id: users.length + 1, username, password: hashedPassword }
    users.push(newUser)

    const registerDB = await getDocs(registerRef);
    const checkData = registerDB.docs.map(doc => ({ ...doc.data(), 
        user_name: doc.data().user_name, 
        email_address: doc.data().email_address 
      })
    );

    // CHECK IF EMAIL ALREADY EXISTS IN "register_user" COLLECTION
    const checkEmail = checkData.find(user => user.email_address === email);
    const checkUser = checkData.find(user => user.user_name === username);

    if (checkUser) {
      return res.status(400).json({ error: "USERNAME ALREADY EXISTS" });
    } else if (checkEmail) {
      return res.status(400).json({ error: "EMAIL ALREADY EXISTS" });
    }

    // ADD NEW USER TO "register_user" COLLECTION
    await addDoc(registerRef, {
      full_name: fullName,
      user_name: username,
      email_address: email,
      user_password: hashedPassword,
      created_date: new Date().toISOString(),
    })

    // GENERATE A "JWT TOKEN" FOR THE USER
    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWTSecretKey, {
    expiresIn: '1h', // Token expires in 1 hour
    });

//-------------POSTGRES SQL CODE----------//
    // await db("register").insert({
    //   first_name: firstName,
    //   last_name: lastName,
    //   email,
    //   username,
    //   password: hashedPassword,
    //   created_date: new Date().toISOString(),
    //   // last_login: null,
    // });
//-------------POSTGRES SQL CODE----------//

    res.cookie("token", token, { httpOnly: true})
    res.status(200).json({ message: "REGISTRATION SUCCESSFULL", token });
  } catch (error) {
    res.status(500).json({ error: "SERVER ERROR!!!" });
  }
});

// LOGIN ROUTE
app.post("/api/login", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    //-------------POSTGRES SQL CODE----------//
    // const user = await db("register").where({ username }).first();

    // if (!user) {
    //   res.status(401).json({ error: "✖ USERNAME NOT FOUND" });
    //   return;
    // }

    // const passwordMatch = await bcrypt.compare(password, user.password);

    // if (!passwordMatch) {
      //   res.status(401).json({ error: "✖ INCORRECT PASSWORD" });
      //   return;
      // }
      // await db("login").insert({
        //   username,
        //   password: user.password,
        // });
    //-------------POSTGRES SQL CODE----------//

    //------------CHECK IF USER EXISTS IN REGISTER DB------------//
    const registerDB = await getDocs(registerRef);
    const checkData = registerDB.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Find the user with matching username and email
    const checkUser = checkData.find(user => user.user_name === username && user.email_address === email);

    // Handle invalid username or email
    if (!checkUser) {
      return res.status(400).json({ error: "INVALID USERNAME OR EMAIL" });
    }

    // Verify the password
    const isPasswordValid = checkUser.user_password && await bcrypt.compare(password, checkUser.user_password);

    if (!isPasswordValid) {
      return res.status(400).json({ error: "INVALID PASSWORD" });
    }

    //------------CHECK IF USER ALREADY LOGGED IN------------//
    // Query Firestore to find if the user already exists in login DB
    const loginQuery = query(loginRef, where("login_user_name", "==", username), where("login_email_address", "==", email));
    const loginDB = await getDocs(loginQuery);

    if (!loginDB.empty) {
      // User already logged in, update login_date
      const loginDocRef = loginDB.docs[0].ref;
      await updateDoc(loginDocRef, { login_date: new Date().toISOString() });
    } else {
      // First-time login, add user to "login_account" collection
      await addDoc(loginRef, {
        login_user_name: checkUser.user_name,
        login_email_address: checkUser.email_address,
        login_date: new Date().toISOString(),
      });
    }

    // Generate a JWT token
    const token = jwt.sign(
      { id: checkUser.id, username: checkUser.user_name },
      JWTSecretKey,
      { expiresIn: "1h" }
    );

    return res.status(200).json({ message: "LOGIN SUCCESSFUL", token });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "SERVER ERROR!!!" });
  }
});

//GOOGLE LOGIN AUTH
app.post("/api/google-auth", async (req, res) => {
  const { idToken } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, name, email } = decodedToken;

    const loginQuery = query(loginRef, where("login_user_name", "==", name), where("login_email_address", "==", email));
    const loginDB = await getDocs(loginQuery);

    if (!loginDB.empty) {
      // User already logged in, update login_date
      const loginDocRef = loginDB.docs[0].ref;
      await updateDoc(loginDocRef, { login_date: new Date().toISOString() });
    } else {
      // First-time login, add user to "login_account" collection
      await addDoc(loginRef, {
        login_user_name: name || "Unknown User",
        login_email_address: email || "Unknown Email",
        login_date: new Date().toISOString(),
      });
    }

    res.json({ message: "Authenticated", user: { uid, name } });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

// LOG OUT ROUTE
app.post("/logout", (req, res) => {
  try {
    res.clearCookie("token");
    res.status(200).json({ message: "LOGOUT SUCCESSFULL"})
  } catch (error) {
    res.status(500).json({ error: "SERVER ERROR!!!" });
  }
})

//----------------------- DEPRECATED -----------------------//

// ROUTE FOR SENDING CONFIRMATION EMAIL TO RESET PASSWORD
app.post("/confirmLink", async (req, res) => {
  const { email } = req.body;
  const expiryTime = Date.now() + 60 * 1000; // Expiry time set to 24 hours from now
  
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
      } else {
        res.status(200).json({ message: "Confirmation email sent" });
        res.status(201).json({ status: 201, info });
      }
    });
  } catch (error) {
    res.status(401).json({ status: 401, error });
  }
});

// ENDPOINT TO RESET PASSWORD IN DATABASE (POSTGRESQL ONLY, maybe will do it in firebase ) 
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
    res.status(500).json({ error: "An error occurred during password reset." });
  }
});
//----------------------- DEPRECATED -----------------------//

//--------------OWNER RENTING THEIR CAR ROUTE---------------//
app.post("/api/owner-data", upload.array("images", 5), async (req, res) => {
  const { carName, price, rent, username } = req.body;

  try {
    //GET "register_user" COLLECTION
    const loginDB = await getDocs(loginRef);
    const checkData = loginDB.docs.map(doc => ({ ...doc.data(),
      login_user_name: doc.data().login_user_name,
      })
    );

    const checkUser = checkData.find(user => user.login_user_name === username);
    if (!checkUser) {
      return res.status(404).json({ error: "USER NOT FOUND" });
    }

    //-------------POSTGRES SQL CODE----------//
    // Assuming you have a function to retrieve the user ID from the username
    // const user = await db("register").where({ username }).first();
    // // console.log(user)
    // if (!user) {
    //   return res.status(404).json({ error: "User not found." });
    // }
    //-------------POSTGRES SQL CODE----------//

    // UPLOAD IMAGES TO CLOUDINARY
    const imageURLS = await Promise.all(
      req.files.map(async (file) => {
        try {
          const result = await cloudinary.uploader.upload(file.path);
          return result.secure_url;
        } catch (uploadError) {
          console.error("Cloudinary upload error:", uploadError);
          throw new Error("Image upload failed");
        }
      })
    );

    // CONVERT THE ARRAY OF IMAGE TO A STRING
    const imageUrlsJson = JSON.stringify(imageURLS);

    //UPLOAD CAR DATA TO "owners_car_data" COLLECTION
    await addDoc(ownerDataRef, {
      owner_car_name: carName,
      owner_car_price: price,
      owner_car_rent: rent,
      owner_image_url: imageUrlsJson,
      login_user_name: checkUser.login_user_name,
    })

    //-------------POSTGRES SQL CODE----------//
    // await db("car_listings").insert({
    //   car_name: carName,
    //   price: price,
    //   rent: rent,
    //   image_url: imageUrlsJson,
    //   login_user_name: user.username,
    // });
    //-------------POSTGRES SQL CODE----------//

    res.status(200).json({ message: "DATA SAVED" });
  } catch (error) {
    res.status(500).json({ error: "SERVOR ERROR!!!" });
  }
});


//DISPLAY ALL CAR DATA LIST FROM DATABASE
app.get("/api/car-data", async (req, res) => {
  try {
    // -------GET ALL CAR LIST FROM POSGRESQL DATABASE------- //
      // const carListings = await db('car_listings').select('*');
    // -------GET ALL CAR LIST FROM POSGRESQL DATABASE------- //

    // GET ALL DATA FROM FIREBASE "owners_car_data" COLLECTION
    const getCarData = await getDocs(ownerDataRef);
    const carListings = getCarData.docs.map(doc => ({ ...doc.data(), id: doc.id }));

    res.json(carListings || []);
  } catch (error) {
    res.status(500).json({ error: 'SERVER ERROR!!!' });
  }
});