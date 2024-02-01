//authMiddleware.js
const jwt = require("jsonwebtoken")
const dotenv = require("dotenv");
dotenv.config();

const jwtSecret = process.env.AUTH0_SECRET_KEY

function authenticateJWT(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ message: "Token verification failed" })
        }

        req.user = user;
        next();
    })
}

module.exports = authenticateJWT