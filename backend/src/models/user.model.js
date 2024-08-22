import mongoose from "mongoose";

const userSchema = mongoose.Schema(
    {
        username: {
            type: String,
            reqired: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },

        email: {
            type: String,
            reqired: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        fullname: {
            type: String,
            reqired: true,
            trim: true,
            index: true,
        },

        avatar: {
            type: String, // cloudinary url
            reqired: true,
        },

        coverImage: {
            type: String, // cloudinary url
        },

        watchHistory: {
            type: mongoose.Schema.ObjectId(),
            red: "Video",
        },

        password: {
            type: String,
            required: [true, "Password is required"],
        },

        refreshToken: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

export const User = mongoose.model("User", userSchema);
