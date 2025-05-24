// Test Beyond Presence API connection and get available avatars
const https = require('https');
const fs = require('fs');
const path = require('path');

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

const env = loadEnv();

// Set environment variables from loaded .env
Object.assign(process.env, env);

async function testBeyondPresenceConnection() {
  const apiKey = process.env.BEYOND_PRESENCE_API_KEY;
  const apiBaseUrl = process.env.BEYOND_PRESENCE_API_BASE_URL;

  if (!apiKey) {
    console.error("BEYOND_PRESENCE_API_KEY not found in environment variables");
    return;
  }

  if (!apiBaseUrl) {
    console.error("BEYOND_PRESENCE_API_BASE_URL not found in environment variables");
    return;
  }

  try {
    console.log("Testing Beyond Presence API connection...");
    console.log("API Base URL:", apiBaseUrl);
    
    // Test GET /v1/avatar to list available avatars
    const response = await fetch(`${apiBaseUrl}/v1/avatar`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "accept": "application/json",
      },
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error:", response.status, response.statusText);
      console.error("Error body:", errorText);
      return;
    }

    const avatars = await response.json();
    console.log("Available avatars:");
    console.log(JSON.stringify(avatars, null, 2));

    if (Array.isArray(avatars) && avatars.length > 0) {
      console.log("\nAvatar IDs you can use:");
      avatars.forEach((avatar, index) => {
        console.log(`${index + 1}. ${avatar.name || 'Unnamed'}: ${avatar.id || avatar.avatar_id}`);
      });
    }

  } catch (error) {
    console.error("Error testing Beyond Presence API:", error.message);
  }
}

testBeyondPresenceConnection();
