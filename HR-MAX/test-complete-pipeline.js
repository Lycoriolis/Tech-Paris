#!/usr/bin/env node

/**
 * Test script for the complete HR Profiling Pipeline with Beyond Presence integration
 * This script demonstrates the full workflow from CV processing to final report generation
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { hrProfilingGraph } from './apps/agents/dist/hr-profiling/graph.js';

import { AccessToken } from 'livekit-server-sdk';

// LiveKit token generator using proper SDK
async function generateLiveKitToken(roomName, participantName) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    console.warn('LiveKit API key and secret not configured, using mock token');
    // Fallback to mock token for testing
    const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({
      sub: participantName,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      room: roomName,
      permissions: {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      }
    })).toString('base64')}.mock_signature`;
    
    console.log(`Generated mock LiveKit token for ${participantName} in room ${roomName}`);
    return mockToken;
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    ttl: 60 * 60, // 1 hour
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  console.log(`Generated proper LiveKit token for ${participantName} in room ${roomName}`);
  return token;
}

async function testHRPipeline() {
  console.log("🚀 Starting HR Profiling Pipeline Test...\n");

  try {
    // Load CV file
    const cvPath = path.join(process.cwd(), 'Margaret-Wangari-Waithaka-CV.pdf');
    if (!fs.existsSync(cvPath)) {
      throw new Error(`CV file not found: ${cvPath}`);
    }
    
    const cvBuffer = fs.readFileSync(cvPath);
    console.log(`✅ Loaded CV file: ${cvPath} (${cvBuffer.length} bytes)\n`);

    // Generate LiveKit token for the candidate
    const roomName = `hr-interview-${Date.now()}`;
    const candidateName = "Margaret Wangari Waithaka";
    const livekitToken = await generateLiveKitToken(roomName, candidateName);

    // Initial state for the pipeline
    const initialState = {
      // Required input
      cvFile: cvBuffer,
      jobId: "software-engineer-2024",
      mode: "interview", // Full pipeline mode
      
      // Optional LinkedIn profile (can be empty)
      linkedinUrl: "", // Empty for this test
      
      // Candidate information
      candidateName: candidateName,
      candidateEmail: "margaret.waithaka@example.com",
      
      // LiveKit integration for Beyond Presence
      livekitToken: livekitToken,
      livekitUrl: process.env.LIVEKIT_URL || "wss://hr-max-livekit.livekit.cloud",
      
      // Initial state
      currentStage: "initialization",
      errors: []
    };

    console.log("📋 Initial Pipeline State:");
    console.log(`   Job ID: ${initialState.jobId}`);
    console.log(`   Candidate: ${initialState.candidateName}`);
    console.log(`   Mode: ${initialState.mode}`);
    console.log(`   LiveKit Room: ${roomName}\n`);

    // Execute the pipeline
    console.log("🔄 Executing HR Profiling Pipeline...\n");
    
    const events = [];
    const stream = await hrProfilingGraph.stream(initialState, {
      streamMode: "values"
    });

    for await (const event of stream) {
      events.push(event);
      
      console.log(`📊 Stage: ${event.currentStage || 'unknown'}`);
      
      // Log key information at each stage
      if (event.currentStage === "recruiter_setup_complete") {
        console.log(`   ✓ Job specifications loaded`);
        console.log(`   ✓ ${event.recruiterQuestions?.length || 0} recruiter questions collected`);
      } else if (event.currentStage === "cv_processed") {
        console.log(`   ✓ CV text extracted (${event.ocrText?.length || 0} characters)`);
      } else if (event.currentStage === "features_extracted") {
        console.log(`   ✓ Features extracted: ${JSON.stringify(event.extractedFeatures?.technicalSkills?.slice(0, 3) || [])}`);
      } else if (event.currentStage === "questions_generated") {
        console.log(`   ✓ ${event.generatedQuestions?.length || 0} interview questions generated`);
      } else if (event.currentStage === "bp_interview_started") {
        console.log(`   ✓ Beyond Presence session started: ${event.bpSessionId}`);
        console.log(`   ✓ Configured agent ID: ${event.configuredAgentId}`);
        console.log(`   ⏳ Waiting for candidate to complete interview...`);
      } else if (event.currentStage === "bp_interview_in_progress") {
        console.log(`   ⏳ Interview in progress... (Status: ${event.bpSessionStatus})`);
      } else if (event.currentStage === "transcript_retrieved") {
        console.log(`   ✓ Interview completed! Retrieved ${event.candidateResponses?.length || 0} responses`);
      } else if (event.currentStage === "responses_evaluated") {
        console.log(`   ✓ ${event.evaluations?.length || 0} responses evaluated`);
      } else if (event.currentStage === "results_generated") {
        console.log(`   ✓ Final reports generated`);
      }
      
      // Handle errors
      if (event.errors && event.errors.length > 0) {
        console.log(`   ❌ Errors: ${event.errors.join(', ')}`);
      }
      
      console.log("");
      
      // Add delay to simulate real processing and avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Final results
    const finalEvent = events[events.length - 1];
    
    console.log("🎉 Pipeline Completed Successfully!\n");
    console.log("📊 Final Results Summary:");
    console.log(`   • Pipeline stages completed: ${events.length}`);
    console.log(`   • Final stage: ${finalEvent.currentStage}`);
    console.log(`   • Interview questions: ${finalEvent.generatedQuestions?.length || 0}`);
    console.log(`   • Candidate responses: ${finalEvent.candidateResponses?.length || 0}`);
    console.log(`   • Evaluations: ${finalEvent.evaluations?.length || 0}`);
    console.log(`   • Reports generated: ${finalEvent.recruiterReport ? 'Yes' : 'No'}\n`);

    if (finalEvent.recruiterReport) {
      console.log("📋 Recruiter Report Preview:");
      console.log("   Title:", finalEvent.recruiterReport.title || "N/A");
      console.log("   Recommendation:", finalEvent.recruiterReport.recommendation || "N/A");
      console.log("   Overall Score:", finalEvent.recruiterReport.overallScore || "N/A");
    }

    if (finalEvent.candidateReport) {
      console.log("\n🎯 Candidate Report Preview:");
      console.log("   Title:", finalEvent.candidateReport.title || "N/A");
      console.log("   Feedback Summary:", finalEvent.candidateReport.summary?.substring(0, 100) + "..." || "N/A");
    }

  } catch (error) {
    console.error("❌ Pipeline Error:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

// Check environment setup
function checkEnvironment() {
  const requiredEnvVars = [
    'BEYOND_PRESENCE_API_KEY',
    'BEYOND_PRESENCE_API_BASE_URL',
    'BEYOND_PRESENCE_AVATAR_ID',
    'MISTRAL_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error("❌ Missing required environment variables:");
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error("\nPlease check your .env file.");
    process.exit(1);
  }

  console.log("✅ Environment variables configured correctly\n");
}

// Main execution
async function main() {
  console.log("🔍 HR-MAX: Beyond Presence Integration Test\n");
  
  checkEnvironment();
  await testHRPipeline();
  
  console.log("\n✨ Test completed successfully!");
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
