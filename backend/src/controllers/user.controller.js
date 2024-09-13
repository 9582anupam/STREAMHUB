import { User } from "../models/user.model.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = await user.generateAccessToken();
        const refreshToken = await user.generateRefreshToken();

        // Save the refresh token in the database
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    } catch (error) {
        console.error("Error generating access and refresh tokens:", error);
        throw new Error("Internal server error");
    }
};

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

const loginUser = async (req, res) => {
    const { email, username, password } = req.body;
    if (!email && !username) {
        return res
            .status(400)
            .json({ message: "Email or username is required" });
    }

    const user = await User.findOne({
        $or: [{ email }, { username }],
    });

    if (!user) {
        return res.status(404).json({ message: "User does not exist" });
    }

    const isPasswordCorrect = await user.isPasswordCorrect(password);

    if (!isPasswordCorrect) {
        return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate access token and refresh token
    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
        user._id
    );

    // previous user var does not have accesstoken.
    // To address this either make a db call again as while calling generateAccessAndRefreshToken adds the accesstoken
    // or we can manually add it to the user var.
    // choose according to the need, here db call is not very expensive so we are going with it.
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
        // .findById(User._id)
        // .select("-password -refreshToken");

    // sending accessToken and refreshToken as cookies
    const option = {
        httpOnly: true,
        secure: true,
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .json({
            statusCode: 200,
            data: loggedInUser, accessToken, refreshToken,
            message: "User logged in successfully",
            success: true
        });
};

const logoutUser = async (req, res) => {
    try {
        const userId = req.user._id;
        await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    refreshToken: undefined,
                }
            },
            {
                new: true,
            }
        );

        const options = {
            httpOnly: true,
            secure: true,
        };
        return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json({
            statusCode: 200,
            message: "User logged out successfully",
            success: true
        });
        
    } catch (error) {
        console.error("Error during user logout:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const refreshAccessToken = async (req, res) => {
    
    try {
        
        const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        
        if (!incomingRefreshToken) {
            return res.status(401).json({ message: "Unauthorized request: Refresh token is required" });
        }

        const decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);

        const user = User.findById(decoded?._id);

        if (!user) {
            return res.status(401).json({ message: "Unauthorized request: Invalid refresh token" });
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            return res.status(401).json({ message: "Unauthorized request: Access token in invalid or expired" });
        }

        // Generate new access token
        const options = {
            httpOnly: true,
            secure: true,
        };

        const { accessToken, newRefreshToken } = await generateAccessAndRefreshToken(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json({
                statusCode: 200,
                data: {accessToken: accessToken, refreshToken: newRefreshToken},
                message: "Access token was updated successfully",
                success: true,
            });


    } catch (error) {
        console.error("Error refreshing access token:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export { registerUser, loginUser, logoutUser, refreshAccessToken };