import mongoose from "mongoose";

// Define the interface for the User document
interface IUser {
    username: string;
    roomId: string;
    cv: Buffer;
    linkedinUrl: string;
    additionalInfo: string;
    review?: string;
}

// Create the schema
const userSchema = new mongoose.Schema<IUser>({
    username: String,
    roomId: String,
    cv: Buffer,
    linkedinUrl: String,
    additionalInfo: String,
    review: String,
});

// Create and export the model
const User = mongoose.model<IUser>("interviews", userSchema);

export default User;