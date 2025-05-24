import express, { Request, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";

import dotenv from "dotenv";

import User from "./mongodb/schema";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Move these middleware configurations BEFORE any route handlers
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Add error handling for MongoDB connection
if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not defined in environment variables");
    process.exit(1);
}

// Use connect instead of createConnection and wait for it
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("Connected to MongoDB");
        // Start the server only after DB connection is established
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    });

// pass the user session data to the database with the token
app.post("/api/session/new", async (req: Request, res: Response): Promise<any> => {
    const { roomId, username, cv, linkedinUrl, additionalInfo } = req.body;
    
    if (!roomId || !username) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    
    try {
        // check if the user already exists
        const user = await User.findOne({ roomId });
        if (user) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Convert the CV array back to Buffer
        const cvBuffer = Buffer.from(cv);

        // create a new user with the buffer
        const newUser = new User({ 
            roomId, 
            username, 
            cv: cvBuffer, // Store as Buffer in MongoDB
            linkedinUrl, 
            additionalInfo 
        });
        await newUser.save();

        res.status(200).json({ message: "Session created and saved successfully" });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ error: "Failed to create user" });
    }
});

// get all users
app.get("/api/users", async (req: Request, res: Response): Promise<any> => {
    const { roomId } = req.body;
    const users = await User.find({roomId});
     try {
        if (!users) {
            return res.status(404).json({ error: "Users not found" });
        }
        res.status(200).json({ "users": users, "message": "Users found successfully" });
    } catch (error) {
        console.error("Error fetching users:", error);
    }
});
