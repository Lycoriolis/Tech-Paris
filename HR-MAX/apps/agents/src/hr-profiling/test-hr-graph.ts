import { hrGraph } from "./graph.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import dotenv from "dotenv";

// Load environment variables from the .env file
async function loadEnvFile() {
  try {
    const envPath = path.resolve("/home/joker/Tech-Paris/HR-MAX/.env");
    console.log(`Loading environment variables from: ${envPath}`);
    
    const envFileExists = await fs.access(envPath).then(() => true).catch(() => false);
    if (!envFileExists) {
      console.warn(`Warning: .env file not found at ${envPath}`);
      return false;
    }
    
    const envConfig = dotenv.config({ path: envPath });
    if (envConfig.error) {
      console.warn(`Error loading .env file: ${envConfig.error.message}`);
      return false;
    }
    
    // Print loading status for required API keys
    const togetherKey = process.env.TOGETHER_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    
    console.log(`TOGETHER_API_KEY loaded: ${togetherKey ? "Yes" : "No"}`);
    console.log(`OPENROUTER_API_KEY loaded: ${openrouterKey ? "Yes" : "No"}`);
    
    return true;
  } catch (error) {
    console.error("Error loading .env file:", error);
    return false;
  }
}

// Utility function to validate API keys
function validateApiKeys() {
  const missingKeys = [];
  
  if (!process.env.TOGETHER_API_KEY) {
    missingKeys.push("TOGETHER_API_KEY (needed for CV OCR with Together AI)");
  }
  
  if (!process.env.OPENROUTER_API_KEY) {
    missingKeys.push("OPENROUTER_API_KEY (needed for OpenRouter chat model access)");
  }
  
  if (missingKeys.length > 0) {
    console.warn("\n⚠️ WARNING ⚠️");
    console.warn(`The following API key(s) are missing: ${missingKeys.join(", ")}`);
    console.warn("Some graph nodes will fail when they try to use these services.");
    console.warn("You can set these keys with:");
    console.warn("TOGETHER_API_KEY=your_key OPENROUTER_API_KEY=your_key node dist/hr-profiling/test-hr-graph.js");
    console.warn("Continuing execution, but expect failures at certain nodes...\n");
    return false;
  }
  
  console.log("✅ API keys check: All required API keys are set.\n");
  return true;
}

async function main() {
  // Load API keys from .env file
  await loadEnvFile();
  
  // Check API keys but continue regardless
  validateApiKeys();
  
  // Define test inputs
  const profileUrl = "https://www.linkedin.com/in/mathieulemoing";
  const cvFilePath = "/home/joker/Tech-Paris/Margaret-Wangari-Waithaka-CV.pdf";
  const jobId = "job123"; // Placeholder job ID
  const userMessage = "Hello, can you process my profile against this job?";

  // Read the CV file
  let cvFileBuffer;
  try {
    cvFileBuffer = await fs.readFile(cvFilePath);
    console.log(`Successfully read CV file: ${cvFilePath} (${cvFileBuffer.length} bytes)`);
  } catch (error) {
    console.error(`Error reading CV file at ${cvFilePath}:`, error);
    return;
  }

  // Prepare inputs for the graph
  const initialInputs = {
    profileUrl,
    cvFile: cvFileBuffer,
    jobId,
    userMessage,
  };

  console.log("\nInitial inputs for the graph:", {
    profileUrl,
    cvFile: `Buffer (size: ${cvFileBuffer.length} bytes)`,
    jobId,
    userMessage,
  });

  console.log("\nStreaming graph execution:");

  try {
    // Stream the graph execution and log each event
    let nodeCounter = 0;
    for await (const event of await hrGraph.stream(initialInputs as any)) {
      nodeCounter++;
      console.log(`\n--- Event ${nodeCounter}: ${Object.keys(event)[0] || "unknown"} ---`);
      
      // Format output for better readability
      console.log(JSON.stringify(event, (_key, value) => {
        // Prevent large buffers from being stringified entirely
        if (value && value.type === 'Buffer' && Array.isArray(value.data) && value.data.length > 100) {
          return `Buffer (size: ${value.data.length} bytes)`;
        }
        return value;
      }, 2));
    }
    console.log("\n--- Graph Execution Finished Successfully ---");

  } catch (error: any) { // Type assertion to 'any' to allow property access
    console.error("\n❌ Error during graph execution:");
    
    // Extract the node name from the error if possible
    const errorString = String(error); // Safely convert to string
    const nodeMatch = errorString.match(/at (\w+)\.invoke/);
    const failedNode = nodeMatch ? nodeMatch[1] : "unknown node";
    
    console.error(`The graph failed at the "${failedNode}" node.`);
    
    // Check for API key related errors
    if (errorString.includes("TOGETHER_API_KEY")) {
      console.error("This is likely due to missing TOGETHER_API_KEY needed for CV OCR.");
    } else if (errorString.includes("OPENROUTER_API_KEY")) {
      console.error("This is likely due to missing OPENROUTER_API_KEY needed for chat models.");
    }
    
    console.error("Full error:", error);
  }
}

main().catch(console.error);
