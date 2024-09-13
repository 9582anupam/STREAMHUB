import { User } from "../models/user.model.js";
import jwt from "jsonwebtoken";

export const verifyJWT = async (req, res, next) => {
    try {
        const token =
            req.cookies?.accessToken ||
            req.header("Authorization")?.replace("Bearer ", "");
        if (!token) {
            return res
                .status(401)
                .json({ message: "Access denied. Please log in." });
        }

        // check is token is correct
        const decoded = await jwt.verify(
            token,
            process.env.ACCESS_TOKEN_SECRET
        );
        const user = await User.findById(decoded.id).select(
            "-password -refreshToken"
        );
        if (!user) {
            return res
                .status(403)
                .json({ message: "Invalid token. Please log in again." });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Error verifying JWT:", error);
        return res
            .status(403)
            .json({ message: "Invalid token. Please log in again." });
    }
};
