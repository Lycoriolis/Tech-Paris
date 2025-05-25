import mongoose from "mongoose";

// Define the interface for the User document
interface AgentResult {
    resultId: string;
    feedback: string;
    finalScore: number;

}

// Create the schema
const agentResultSchema = new mongoose.Schema<AgentResult>({
    resultId: String,
    feedback: String,
    finalScore: Number,
});

// Create and export the model
const AgentResult = mongoose.model<AgentResult>("score", agentResultSchema);

export default AgentResult;