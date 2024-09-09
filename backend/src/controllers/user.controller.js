import { User } from "../models/user.model.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const registerUser = async (req, res) => {
    try {
        // Extract user details from request body
        const { username, email, fullName, password } = req.body;

        // Validate that all required fields are provided
        if (![username, email, fullName, password].every(field => field?.trim())) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check if the user already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { username }],
        });

        if (existingUser) {
            return res.status(409).json({ message: "User already exists" });
        }

        // Ensure the avatar is provided
        if (!req.files || !req.files["avatar"]) {
            return res.status(400).json({ message: "Avatar is required" });
        }

        const avatarLocalPath = req.files["avatar"][0].path;

        // Upload avatar to Cloudinary
        const avatarUploadResult = await uploadToCloudinary(avatarLocalPath);
        if (!avatarUploadResult) {
            return res.status(500).json({ message: "Error uploading avatar" });
        }

        // Optional cover image upload
        let coverImageUrl = "";
        if (req.files && req.files["coverImage"]) {
            const coverImageLocalPath = req.files["coverImage"][0].path;
            const coverImageUploadResult = await uploadToCloudinary(coverImageLocalPath);
            if (coverImageUploadResult) {
                coverImageUrl = coverImageUploadResult;
            }
        }

        // Create the new user
        const newUser = await User.create({
            username: username.toLowerCase(),
            email,
            fullName,
            password,
            avatar: avatarUploadResult,
            coverImage: coverImageUrl,
        });

        // Retrieve the created user without sensitive information
        const createdUser = await User.findById(newUser._id).select("-password -refreshToken");

        if (!createdUser) {
            return res.status(500).json({ message: "Error creating user" });
        }

        return res.status(201).json({
            user: createdUser,
            message: "User created successfully"
        });

    } catch (error) {
        console.error("Error during user registration:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export { registerUser };