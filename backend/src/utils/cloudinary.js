import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// Configure Cloudinary

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = async (localFilePath) => {
    try {
        // Validate localFilePath before uploading
        if (!localFilePath) {
            return null;
        }

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });
        console.log("Upload successful to Cloudinary", response.url);
        return response.url;
    } catch (error) {
        console.error("Error uploading to Cloudinary", error);
        fs.unlinkSync(localFilePath);
        return null;
    }
};
