import { User } from "../models/user.model.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = await user.generateAccessToken();
        const newRefreshToken = await user.generateRefreshToken();

        // Save the refresh token in the database
        user.refreshToken = newRefreshToken;
        await user.save({ validateBeforeSave: false });
        return { accessToken, newRefreshToken };
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
        if (
            ![username, email, fullName, password].every((field) =>
                field?.trim()
            )
        ) {
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
        const avatarUrl = avatarUploadResult?.url;
        if (!avatarUrl) {
            return res.status(500).json({ message: "Error uploading avatar" });
        }

        // Optional cover image upload
        let coverImageUrl = "";
        if (req.files && req.files["coverImage"]) {
            const coverImageLocalPath = req.files["coverImage"][0].path;
            const coverImageUploadResult = await uploadToCloudinary(
                coverImageLocalPath
            );
            if (coverImageUploadResult) {
                coverImageUrl = coverImageUploadResult.url;
            }
        }

        // Create the new user
        const newUser = await User.create({
            username: username.toLowerCase(),
            email,
            fullName,
            password,
            avatar: avatarUrl,
            coverImage: coverImageUrl,
        });

        // Retrieve the created user without sensitive information
        const createdUser = await User.findById(newUser._id).select(
            "-password -refreshToken"
        );

        if (!createdUser) {
            return res.status(500).json({ message: "Error creating user" });
        }

        return res.status(201).json({
            user: createdUser,
            message: "User created successfully",
        });
    } catch (error) {
        console.error("Error during user registration:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const loginUser = async (req, res) => {
    try {
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
        const { accessToken, newRefreshToken } =
            await generateAccessAndRefreshToken(user._id);

        // previous user var does not have accesstoken.
        // To address this either make a db call again as while calling generateAccessAndRefreshToken adds the accesstoken
        // or we can manually add it to the user var.
        // choose according to the need, here db call is not very expensive so we are going with it.
        const loggedInUser = await User.findById(user._id).select(
            "-password -refreshToken"
        );

        // sending accessToken and refreshToken as cookies
        const option = {
            httpOnly: true,
            secure: true,
        };

        return res
            .status(200)
            .cookie("accessToken", accessToken, option)
            .cookie("refreshToken", newRefreshToken, option)
            .json({
                statusCode: 200,
                data: loggedInUser,
                accessToken,
                newRefreshToken,
                message: "User logged in successfully",
                success: true,
            });
    } catch (error) {
        console.error("Error during user login:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const logoutUser = async (req, res) => {
    try {
        const userId = req.user._id;
        await User.findByIdAndUpdate(
            userId,
            {
                $set: {
                    refreshToken: 1,
                },
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
                success: true,
            });
    } catch (error) {
        console.error("Error during user logout:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const refreshAccessToken = async (req, res) => {
    try {
        const incomingRefreshToken =
            req.cookies?.refreshToken || req.body?.refreshToken;

        if (!incomingRefreshToken) {
            return res.status(401).json({
                message: "Unauthorized request: Refresh token is required",
            });
        }

        const decoded = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        const user = await User.findById(decoded?._id);

        if (!user) {
            return res.status(401).json({
                message: "Unauthorized request: Invalid refresh token",
            });
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            return (
                res
                    .status(401)
                    // Generate new access token
                    .json({
                        message:
                            "Unauthorized request: Access token in invalid or expired",
                    })
            );
        }

        const options = {
            httpOnly: true,
            secure: true,
        };

        const { accessToken, newRefreshToken } =
            await generateAccessAndRefreshToken(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json({
                statusCode: 200,
                data: {
                    accessToken: accessToken,
                    refreshToken: newRefreshToken,
                },
                message: "Access token was updated successfully",
                success: true,
            });
    } catch (error) {
        console.error("Error refreshing access token:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);
        const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

        if (!isPasswordCorrect) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        user.password = newPassword;
        await user.save();
        return res.status(200).json({
            statusCode: 200,
            data: {},
            message: "Password reset successfully",
            success: true,
        });
    } catch (error) {
        console.error("Error reseting password:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const getCurrentUser = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({
                statusCode: 401,
                data: {},
                message: "unauthorized user",
                success: false,
            });
        }

        return res.status(200).json({
            statusCode: 200,
            data: { user },
            message: "user fetched successfully",
            success: true,
        });
    } catch (error) {
        console.error("Error fetching user:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const updateAccountDetails = async (req, res) => {
    try {
        const { fullName, email } = req?.body;
        if (!fullName || !email) {
            return res
                .status(400)
                .json({ message: "Full name and email are required" });
        }

        const user = await User.findByIdAndUpdate(
            req.user?._id,
            {
                $set: {
                    fullName,
                    email,
                },
            },
            {
                new: true,
            }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
            statusCode: 200,
            data: { user },
            message: "Account details updated successfully",
            success: true,
        });
    } catch (error) {
        console.error("Error updating account details:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const updateUserAvatar = async (req, res) => {
    try {
        const avatar = req.file?.path;

        if (!avatar) {
            return res.status(400).json({ message: "Avatar is required" });
        }

        const newAvatar = await uploadToCloudinary(avatar);

        if (!newAvatar) {
            return res
                .status(400)
                .json({ message: "Failed to upload avatar to cloudinary" });
        }

        const user = await User.findByIdAndUpdate(
            req.user?._id,
            {
                $set: {
                    avatar: newAvatar.url,
                },
            },
            {
                new: true,
            }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
            statusCode: 200,
            data: { user },
            message: "Avatar updated successfully",
            success: true,
        });
    } catch (error) {
        console.error("Error updating user avatar:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const updateUserCoverImage = async (req, res) => {
    try {
        const coverImage = req.file?.path;
        if (!coverImage) {
            return res.status(400).json({ message: "Cover Image is required" });
        }

        const newcoverImage = await uploadToCloudinary(coverImage);

        if (!newcoverImage?.url) {
            return res.status(400).json({
                message: "Failed to upload Cover Image to cloudinary",
            });
        }

        const user = await User.findByIdAndUpdate(
            req.user?._id,
            {
                $set: {
                    coverImage: newcoverImage.url,
                },
            },
            {
                new: true,
            }
        ).select("-password");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({
            statusCode: 200,
            data: { user },
            message: "Avatar updated successfully",
            success: true,
        });
    } catch (error) {
        console.error("Error updating user avatar:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

const getUserChannelProfile = async (req, res) => {
    const { username } = req.params;

    if (!username?.trim()) {
        return res
            .status(400)
            .json({ statusCode: 400, message: "Username is missing" });
    }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase(),
            },
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers",
            },
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo",
            },
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers",
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo",
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false,
                    },
                },
            },
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1,
            },
        },
    ]);

    if (!channel?.length) {
        return res
            .status(404)
            .json({ statusCode: 404, message: "Channel does not exists" });
    }

    return res.status(200).json({
        statusCode: 200,
        data: channel[0],
        message: "User channel fetched successfully",
        success: true,
    });
};

const getWatchHistory = async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id),
            },
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1,
                                    },
                                },
                            ],
                        },
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner",
                            },
                        },
                    },
                ],
            },
        },
    ]);
    return res.status(200).json({
        statusCode: 200,
        data: user[0].watchHistory,
        message: "Watch history fetched successfully",
        success: true,
    });
};

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    resetPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
};
