#!/usr/bin/env node

/**
 * Simple test script for Beyond Presence integration
 * This script tests the core functionality without the full pipeline
 */

const fs = require('fs');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');

// Simple .env parser
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    return {};
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      env[key.trim()] = valueParts.join('=').replace(/"/g, '').trim();
    }
  });
  
  return env;
}

// Set environment variables
const env = loadEnv();
Object.assign(process.env, env);

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

// Beyond Presence API functions
async function makeBpApiRequest(endpoint, method, body = null) {
  const apiKey = process.env.BEYOND_PRESENCE_API_KEY;
  const apiBaseUrl = process.env.BEYOND_PRESENCE_API_BASE_URL;
  
  if (!apiKey || !apiBaseUrl) {
    throw new Error('Beyond Presence API configuration missing');
  }

  const url = `${apiBaseUrl}${endpoint}`;
  const options = {
    method,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`Making BP API request: ${method} ${url}`);
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`BP API Error Details: ${response.status} ${response.statusText}`);
    console.error(`Response: ${errorText}`);
    throw new Error(`BP API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

async function createBpAgent() {
  const agentConfig = {
    avatar_id: process.env.BEYOND_PRESENCE_AVATAR_ID,
    system_prompt: `You are an AI recruiter conducting a professional job interview for a Software Engineer position. 

Your role is to:
1. Ask thoughtful questions about technical skills, experience, and problem-solving
2. Evaluate responses professionally and provide constructive feedback
3. Maintain a friendly but professional demeanor throughout the interview
4. Ask follow-up questions to clarify technical concepts

Interview Questions to cover:
1. "Can you tell me about your experience with TypeScript and Node.js?"
2. "Describe a challenging technical problem you've solved recently."
3. "How do you approach debugging complex issues in production?"
4. "What's your experience with React and modern frontend development?"
5. "How do you ensure code quality and maintainability in your projects?"

Please conduct the interview naturally, asking these questions in a conversational manner and adapting based on the candidate's responses.`,
    name: "HR-MAX Interviewer",
    language: "en",
    greeting: "Hello! I'm excited to interview you today for the Software Engineer position. I'll be asking you some questions about your technical background and experience. Are you ready to begin?",
    max_session_length_minutes: 15,
    capabilities: ["webcam_vision"]
  };

  return makeBpApiRequest('/v1/agent', 'POST', agentConfig);
}

async function createBpSession(agentId, livekitToken) {
  const sessionConfig = {
    avatar_id: agentId,
    livekit_url: process.env.LIVEKIT_URL,
    livekit_token: livekitToken,
  };

  return makeBpApiRequest('/v1/session', 'POST', sessionConfig);
}

async function checkSessionStatus(sessionId) {
  const response = await makeBpApiRequest(`/v1/session/${sessionId}`, 'GET');
  console.log('DEBUG: Full session status response:', JSON.stringify(response, null, 2));
  return response;
}

async function getSessionTranscript(sessionId) {
  return makeBpApiRequest(`/v1/session/${sessionId}/transcript`, 'GET');
}

async function testBeyondPresenceIntegration() {
  console.log('🚀 Testing Beyond Presence Integration...\n');

  try {
    // Check environment first
    console.log('🔍 Checking environment variables...');
    const requiredVars = ['BEYOND_PRESENCE_API_KEY', 'BEYOND_PRESENCE_API_BASE_URL', 'BEYOND_PRESENCE_AVATAR_ID', 'LIVEKIT_URL'];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Missing environment variable: ${varName}`);
      }
      console.log(`   ✅ ${varName}: ${process.env[varName].substring(0, 20)}...`);
    }
    console.log();

    // 1. Generate LiveKit token
    console.log('🔑 Generating LiveKit token...');
    const roomName = `hr-interview-${Date.now()}`;
    const candidateName = "Test Candidate";
    const livekitToken = await generateLiveKitToken(roomName, candidateName);
    console.log('✅ Generated LiveKit token\n');

    // 2. Try creating session with base avatar directly
    console.log('🎥 Testing session creation with base avatar...');
    const baseAvatarId = process.env.BEYOND_PRESENCE_AVATAR_ID;
    console.log(`Using base avatar ID: ${baseAvatarId}`);
    
    try {
      const session = await createBpSession(baseAvatarId, livekitToken);
      console.log(`✅ Started session: ${session.id}`);
      console.log(`   LiveKit URL: ${session.livekit_url}`);
      console.log(`   Created at: ${session.created_at}\n`);

      // 3. Monitor session status
      console.log('⏱️  Monitoring session status...');
      let status = await checkSessionStatus(session.id);
      console.log(`   Current status: ${status.status}`);
      
      if (status.status === 'active') {
        console.log('🔴 Session is active - candidate can now join the interview!');
        console.log('   This would be where the candidate connects via WebRTC...\n');
      }

      return; // Exit successfully
    } catch (error) {
      console.log(`❌ Base avatar session failed: ${error.message}`);
      console.log('Trying custom agent approach...\n');
    }

    // 4. Fallback: Create Beyond Presence agent
    console.log('📝 Creating Beyond Presence agent...');
    const agent = await createBpAgent();
    console.log(`✅ Created agent: ${agent.name} (ID: ${agent.id})\n`);

    // 5. Start interview session with custom agent
    console.log('🎥 Starting interview session with custom agent...');
    const session = await createBpSession(agent.id, livekitToken);
    console.log(`✅ Started session: ${session.id}`);
    console.log(`   LiveKit URL: ${session.livekit_url}`);
    console.log(`   Created at: ${session.created_at}\n`);

    // 6. Monitor session status
    console.log('⏱️  Monitoring session status...');
    let status = await checkSessionStatus(session.id);
    console.log(`   Current status: ${status.status}`);
    
    if (status.status === 'active') {
      console.log('🔴 Session is active - candidate can now join the interview!');
      console.log('   To join: Use the LiveKit URL and token in a WebRTC client');
    }

    // 5. Check for transcript (if session completes quickly)
    setTimeout(async () => {
      try {
        const updatedStatus = await checkSessionStatus(session.id);
        console.log(`\n📊 Updated status: ${updatedStatus.status}`);
        
        if (updatedStatus.status === 'completed') {
          console.log('📄 Retrieving transcript...');
          const transcript = await getSessionTranscript(session.id);
          console.log('✅ Transcript retrieved successfully!');
          console.log(`   Segments: ${transcript.transcripts?.length || 0}`);
          console.log(`   Duration: ${transcript.duration_seconds || 'N/A'} seconds`);
        }
      } catch (error) {
        console.log('ℹ️  Session may still be active or transcript not ready');
      }
    }, 10000); // Check after 10 seconds

    console.log('\n🎉 Beyond Presence integration test completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   Agent ID: ${agent.id}`);
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Room: ${roomName}`);
    console.log(`   Status: Ready for interview`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the test
testBeyondPresenceIntegration();
