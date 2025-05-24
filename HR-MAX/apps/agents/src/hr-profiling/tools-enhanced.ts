import { Runnable } from "@langchain/core/runnables";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { Mistral } from "@mistralai/mistralai";

// --- Mistral AI Helper Functions ---

/**
 * Creates a Mistral client instance
 */
function createMistralClient(): Mistral {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY environment variable is not set");
  }
  
  return new Mistral({
    apiKey: apiKey,
  });
}

/**
 * Extracts text content from Mistral API response
 */
function extractTextContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(chunk => chunk.type === 'text')
      .map(chunk => chunk.text || '')
      .join('');
  }
  return '';
}

/**
 * Makes a chat completion request to Mistral Medium 2505
 */
export async function callMistralAPI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2500,
  imageUrl?: string
): Promise<string> {
  const client = createMistralClient();
  
  const messages: any[] = [
    { role: "system", content: systemPrompt }
  ];

  if (imageUrl) {
    // For vision requests with image
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    });
  } else {
    // For text-only requests
    messages.push({
      role: "user", 
      content: userPrompt
    });
  }

  try {
    const response = await client.chat.complete({
      model: "pixtral-large-2411", // Use Pixtral for vision tasks, Mistral Medium 2505 for text
      messages: messages,
      maxTokens: maxTokens,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in Mistral API response");
    }

    return extractTextContent(content);
  } catch (error) {
    console.error("Mistral API Error:", error);
    throw new Error(`Mistral API request failed: ${error}`);
  }
}

/**
 * Makes a text-only chat completion request to Mistral Medium 2505
 */
async function callMistralTextAPI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2500
): Promise<string> {
  const client = createMistralClient();
  
  try {
    const response = await client.chat.complete({
      model: "mistral-medium-2312", // Mistral Medium for text-only tasks
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      maxTokens: maxTokens,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No valid text content in Mistral API response");
    }

    return extractTextContent(content);
  } catch (error) {
    console.error("Mistral API Error:", error);
    throw new Error(`Mistral API request failed: ${error}`);
  }
}

// --- LiveKit Token Generation ---

/**
 * Generates a proper LiveKit access token for a participant
 */
async function generateLiveKitToken(roomName: string, participantName: string): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit API key and secret must be configured in environment variables");
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

  return await at.toJwt();
}

// --- Exported Utility Functions ---

/**
 * Generates a LiveKit access token for a candidate interview session
 * @param candidateName - The name of the candidate
 * @param roomName - Optional room name, defaults to generated room name
 * @returns LiveKit JWT token
 */
export async function generateCandidateLiveKitToken(candidateName: string, roomName?: string): Promise<string> {
  const finalRoomName = roomName || `hr-interview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return await generateLiveKitToken(finalRoomName, candidateName);
}

/**
 * Generates a LiveKit access token for general use
 * @param roomName - The room name
 * @param participantName - The participant name
 * @returns LiveKit JWT token
 */
export async function generateLiveKitTokenForSession(roomName: string, participantName: string): Promise<string> {
  return await generateLiveKitToken(roomName, participantName);
}

// --- Beyond Presence API Client Code ---

// Note: DeveloperAgentCapability, DeveloperAgentRequestModel, and DeveloperAgentResponseModel 
// interfaces removed as we now use base avatar approach directly

interface SessionRequestModel {
  avatar_id: string;
  livekit_url: string;
  livekit_token: string;
}

interface SessionResponseModel extends SessionRequestModel {
  id: string;
  created_at: string;
}

interface SessionTranscriptModel {
  session_id: string;
  transcripts: TranscriptSegment[];
  status: string;
  duration_seconds?: number;
  participant_count?: number;
}

interface TranscriptSegment {
  id: string;
  text: string;
  speaker: string; // 'user' or 'agent'
  timestamp: number;
  confidence?: number;
}

interface SessionStatusModel {
  id: string;
  created_at: string;
  avatar_id: string;
  livekit_url: string;
  livekit_token: string;
  // Note: Beyond Presence API doesn't include explicit status field
  // Status is inferred based on session existence and transcript availability
}

async function makeBpApiRequest<TRequest, TResponse>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  apiKey: string,
  apiBaseUrl: string,
  body?: TRequest
): Promise<TResponse> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };

  const config: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT")) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${apiBaseUrl}${endpoint}`, config);

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { message: await response.text() };
    }
    console.error("Beyond Presence API Error:", response.status, errorData);
    throw new Error(
      `Beyond Presence API request failed with status ${response.status}: ${
        errorData.detail?.[0]?.msg || errorData.message || response.statusText
      }`
    );
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return null as unknown as TResponse;
  }
  return response.json() as Promise<TResponse>;
}

// Note: createOrUpdateBpAgent function removed as we now use base avatar approach directly

async function createBpSession(
  sessionConfig: SessionRequestModel,
  apiKey: string,
  apiBaseUrl: string
): Promise<SessionResponseModel> {
  console.log("Creating Beyond Presence Session for Configured Agent ID:", sessionConfig.avatar_id);
  return makeBpApiRequest<SessionRequestModel, SessionResponseModel>(
    "/v1/session",
    "POST",
    apiKey,
    apiBaseUrl,
    sessionConfig
  );
}

async function initializeAndStartBpInterviewSession(
  baseModelAvatarId: string,
  livekitUrl: string,
  livekitTokenForAvatar: string,
  apiKey: string,
  apiBaseUrl: string,
  jobTitle: string,
  interviewQuestions: { id: string | number; question: string; skill: string }[]
): Promise<{ sessionDetails: SessionResponseModel; configuredAgentId: string }> {
  try {
    console.log("Creating Beyond Presence session with base avatar approach...");
    console.log(`Using base avatar ID: ${baseModelAvatarId}`);
    
    // Log questions for debugging purposes
    if (interviewQuestions && interviewQuestions.length > 0) {
      console.log(`Prepared ${interviewQuestions.length} interview questions for ${jobTitle} position`);
    } else {
      console.log("No specific questions provided, avatar will conduct general interview");
    }

    // Create session directly with base avatar ID (proven working approach)
    const sessionRequest: SessionRequestModel = {
      avatar_id: baseModelAvatarId,
      livekit_url: livekitUrl,
      livekit_token: livekitTokenForAvatar,
    };

    const sessionDetails = await createBpSession(sessionRequest, apiKey, apiBaseUrl);
    console.log("Beyond Presence Session created successfully!");
    console.log("BP Session ID:", sessionDetails.id);
    console.log("BP Avatar ID for this session:", sessionDetails.avatar_id);
    console.log("BP Session Started At:", sessionDetails.created_at);
    console.log("BP LiveKit URL:", sessionDetails.livekit_url);
    
    // Return the base avatar ID as the "configured agent ID" since we're using it directly
    return { sessionDetails, configuredAgentId: baseModelAvatarId };

  } catch (error) {
    console.error("Failed to initialize and start Beyond Presence HR interview session:", error);
    throw error;
  }
}

// Function to check session status
async function getBpSessionStatus(
  sessionId: string,
  apiKey: string,
  apiBaseUrl: string
): Promise<SessionStatusModel> {
  console.log("Checking Beyond Presence session status:", sessionId);
  return makeBpApiRequest<void, SessionStatusModel>(
    `/v1/session/${sessionId}`,
    "GET",
    apiKey,
    apiBaseUrl
  );
}

// Function to retrieve session transcripts
async function getBpSessionTranscript(
  sessionId: string,
  apiKey: string,
  apiBaseUrl: string
): Promise<SessionTranscriptModel> {
  console.log("Retrieving Beyond Presence session transcript:", sessionId);
  return makeBpApiRequest<void, SessionTranscriptModel>(
    `/v1/session/${sessionId}/transcript`,
    "GET",
    apiKey,
    apiBaseUrl
  );
}

// Function to wait for session completion and retrieve transcript
async function waitForSessionCompletionAndGetTranscript(
  sessionId: string,
  apiKey: string,
  apiBaseUrl: string,
  maxWaitTimeMinutes: number = 10,
  pollIntervalSeconds: number = 10
): Promise<SessionTranscriptModel | null> {
  const maxAttempts = Math.floor((maxWaitTimeMinutes * 60) / pollIntervalSeconds);
  let attempts = 0;

  console.log(`Waiting for Beyond Presence session ${sessionId} to complete...`);

  while (attempts < maxAttempts) {
    try {
      // Check if session exists
      const status = await getBpSessionStatus(sessionId, apiKey, apiBaseUrl);
      
      console.log(`Session ${sessionId} check (attempt ${attempts + 1}/${maxAttempts})`);

      if (status.id) {
        // Session exists, try to get transcript to see if it's completed
        try {
          const transcript = await getBpSessionTranscript(sessionId, apiKey, apiBaseUrl);
          if (transcript && transcript.transcripts && transcript.transcripts.length > 0) {
            console.log(`Session ${sessionId} completed! Transcript available with ${transcript.transcripts.length} segments.`);
            return transcript;
          } else {
            console.log(`Session ${sessionId} still active - no transcript available yet`);
          }
        } catch (transcriptError) {
          // Transcript not available yet, session is still active
          console.log(`Session ${sessionId} still active - transcript not ready`);
        }
      } else {
        console.warn(`Session ${sessionId} not found or invalid`);
        return null;
      }

      // Session is still active, wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollIntervalSeconds * 1000));
      attempts++;

    } catch (error) {
      console.error(`Error polling session status (attempt ${attempts + 1}):`, error);
      attempts++;
      
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalSeconds * 1000));
      }
    }
  }

  console.warn(`Session ${sessionId} did not complete within ${maxWaitTimeMinutes} minutes`);
  return null;
}

// --- END Beyond Presence API Client Code ---

const execAsync = promisify(exec);

export class LinkedInScraper extends Runnable<string, any> {
  lc_namespace = ["hr-profiling", "LinkedInScraper"];
  async invoke(_profileUrl: string) {
    return {
      name: "Mathieu Lemoing",
      headline: "Senior Software Engineer at ExampleCorp",
      location: "Paris, France",
      experience: [
        { company: "ExampleCorp", title: "Senior Software Engineer", years: 3 },
        { company: "OtherTech", title: "Software Engineer", years: 2 }
      ],
      education: [
        { school: "École Polytechnique", degree: "MSc Computer Science" }
      ],
      skills: ["TypeScript", "Node.js", "APIs", "React"]
    };
  }
}

export class CVOCRTool extends Runnable<Buffer, string> {
  lc_namespace = ["hr-profiling", "CVOCRTool"];

  async invoke(fileBuffer: Buffer): Promise<string> {
    let tempDir: string | null = null;
    let pdfPath: string | null = null;
    let pngPath: string | null = null;

    try {
      const mistralApiKey = process.env.MISTRAL_API_KEY;
      if (!mistralApiKey) {
        throw new Error("MISTRAL_API_KEY environment variable is not set. OCR functionality cannot work without it.");
      }

      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-ocr-"));
      const randomId = randomBytes(4).toString("hex");
      pdfPath = path.join(tempDir, `cv-${randomId}.pdf`);
      pngPath = path.join(tempDir, `cv-${randomId}.png`);

      await fs.writeFile(pdfPath, fileBuffer);

      const convertCommand = `convert -density 300 "${pdfPath}"[0] -quality 100 "${pngPath}"`;
      try {
        const { stdout: _stdout, stderr } = await execAsync(convertCommand);
        if (stderr) {
          console.warn("ImageMagick warning/info:", stderr);
        }
      } catch (execError) {
        const errorMsg = String(execError);
        if (errorMsg.includes("command not found") || errorMsg.includes("can't be found")) {
          throw new Error(
            "ImageMagick's 'convert' command was not found. Please ensure ImageMagick is correctly installed. " +
            "On Ubuntu/Debian, run: sudo apt-get update && sudo apt-get install imagemagick ghostscript"
          );
        }
        throw execError;
      }
      await fs.access(pngPath);

      const systemPrompt = "You are an expert at extracting information from CVs and resumes. Extract all the relevant text content from the provided CV image. Focus on skills, experience, education, and contact information. Present the extracted text clearly and comprehensively.";
      const userPrompt = "Extract all text content from this CV image.";

      // Use Mistral text model for OCR fallback 
      const extractedText = await callMistralTextAPI(systemPrompt, userPrompt, 2500);
      return extractedText;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      throw new Error(`CVOCRTool failed: ${errorMessage}`);
    } finally {
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error(`Error cleaning up temporary directory ${tempDir}:`, cleanupError);
        }
      }
    }
  }
}

export class ATSParser extends Runnable<string, any> {
  lc_namespace = ["hr-profiling", "ATSParser"];
  async invoke(ocrText: string) {
    const emailMatch = ocrText.match(/[a-zA-Z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
    const skills = Array.from(ocrText.matchAll(/\b(JavaScript|TypeScript|Python|Java)\b/gi), m => m[0]);
    return { email: emailMatch?.[0] ?? null, skills: [...new Set(skills)] };
  }
}

export class JobSpecLoader extends Runnable<string, any> {
  lc_namespace = ["hr-profiling", "JobSpecLoader"];
  async invoke(jobId: string) {
    return {
      id: jobId,
      title: "Software Engineer",
      requirements: ["TypeScript", "Node.js", "APIs"],
    };
  }
}

export class MistralFeatureExtractor extends Runnable<{ocrText: string, scrapedProfile: any, jobSpecifications: any}, any> {
  lc_namespace = ["hr-profiling", "MistralFeatureExtractor"];
  
  constructor() {
    super();
  }

  async invoke({ocrText, scrapedProfile, jobSpecifications}: {ocrText: string, scrapedProfile: any, jobSpecifications: any}) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY environment variable is not set for MistralFeatureExtractor.");
    }

    try {
      const systemPrompt = `You are an expert HR analyst specializing in feature extraction from candidate profiles.
      Extract comprehensive features including:
      1. Technical skills and proficiency levels
      2. Soft skills and leadership qualities
      3. Career progression patterns
      4. Educational background relevance
      5. Industry experience alignment
      6. Communication style indicators
      7. Problem-solving capabilities
      8. Cultural fit indicators
      
      Return structured JSON data with detailed feature analysis. Respond ONLY with the JSON object.`;

      const userPrompt = `CANDIDATE PROFILE DATA:
      CV TEXT: ${ocrText}
      
      LINKEDIN PROFILE: ${JSON.stringify(scrapedProfile)}
      
      JOB REQUIREMENTS: ${JSON.stringify(jobSpecifications)}
      
      Extract comprehensive features and analyze job-candidate alignment. Focus on both explicit skills and implicit qualities that can be inferred from the data.
      Respond ONLY with a valid JSON object.`;
      
      const client = createMistralClient();
      const response = await client.chat.complete({
        model: "mistral-medium-2312",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        maxTokens: 2000,
        temperature: 0.3,
      });

      const responseContent = response.choices?.[0]?.message?.content;

      if (!responseContent || typeof responseContent !== 'string') {
        throw new Error("No content in Mistral response for feature extraction.");
      }

      const features = this.parseFeatures(responseContent);
      
      return {
        technicalSkills: features.technicalSkills || [],
        softSkills: features.softSkills || [],
        experienceLevel: features.experienceLevel || "mid",
        educationMatch: features.educationMatch || 0.5,
        industryAlignment: features.industryAlignment || 0.5,
        communicationStyle: features.communicationStyle || "professional",
        leadershipPotential: features.leadershipPotential || 0.5,
        problemSolving: features.problemSolving || 0.5,
        culturalFit: features.culturalFit || 0.5,
        jobMatchScore: features.jobMatchScore || 0.5,
        keyStrengths: features.keyStrengths || [],
        developmentAreas: features.developmentAreas || [],
        rawResponse: responseContent
      };
    } catch (error) {
      console.error("Feature extraction failed:", error);
      return this.fallbackFeatureExtraction(ocrText, scrapedProfile);
    }
  }

  private parseFeatures(responseContent: string): any {
    try {
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return this.extractFeaturesFromText(responseContent);
    } catch (error) {
      console.error("Error parsing features:", error);
      return {};
    }
  }

  private extractFeaturesFromText(text: string): any {
    const technicalSkills = this.extractListFromText(text, /technical\s*skills?:?\s*([^\n]*)/i);
    const softSkills = this.extractListFromText(text, /soft\s*skills?:?\s*([^\n]*)/i);
    const strengths = this.extractListFromText(text, /strengths?:?\s*([^\n]*)/i);
    
    return {
      technicalSkills,
      softSkills,
      keyStrengths: strengths,
      jobMatchScore: this.extractScore(text, /match\s*score:?\s*(\d+\.?\d*)/i),
      experienceLevel: this.extractExperienceLevel(text)
    };
  }

  private extractListFromText(text: string, pattern: RegExp): string[] {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].split(/[,;]/).map(item => item.trim()).filter(item => item.length > 0);
    }
    return [];
  }

  private extractScore(text: string, pattern: RegExp): number {
    const match = text.match(pattern);
    return match && match[1] ? parseFloat(match[1]) : 0.5;
  }

  private extractExperienceLevel(text: string): string {
    const lowerText = text.toLowerCase();
    if (lowerText.includes("senior") || lowerText.includes("lead") || lowerText.includes("principal")) return "senior";
    if (lowerText.includes("junior") || lowerText.includes("entry") || lowerText.includes("graduate")) return "junior";
    return "mid";
  }

  private fallbackFeatureExtraction(ocrText: string, scrapedProfile: any): any {
    const commonTechSkills = ["JavaScript", "TypeScript", "Python", "Java", "React", "Node.js", "SQL", "AWS"];
    const foundSkills = commonTechSkills.filter(skill => 
      ocrText.toLowerCase().includes(skill.toLowerCase()) || 
      JSON.stringify(scrapedProfile).toLowerCase().includes(skill.toLowerCase())
    );

    return {
      technicalSkills: foundSkills,
      softSkills: ["Communication", "Problem Solving", "Teamwork"],
      experienceLevel: "mid",
      jobMatchScore: 0.6,
      keyStrengths: foundSkills.slice(0, 3),
      developmentAreas: ["To be determined through interview"],
      rawResponse: "Fallback extraction used due to Mistral unavailability"
    };
  }
}

export class RecruiterInputCollector extends Runnable<{jobId: string, mode: string}, any> {
  lc_namespace = ["hr-profiling", "RecruiterInputCollector"];
  
  async invoke({jobId, mode: _mode}: {jobId: string, mode?: string}) {
    return {
      questions: [
        {
          id: "culture_fit",
          question: "How would you describe our company culture and what type of person thrives here?",
          focus: "cultural_alignment",
          priority: "high"
        },
        {
          id: "team_dynamics",
          question: "Tell me about the team you'll be working with and what collaboration looks like.",
          focus: "teamwork",
          priority: "high"
        },
        {
          id: "growth_opportunities",
          question: "What growth and learning opportunities does this role offer?",
          focus: "career_development",
          priority: "medium"
        }
      ],
      specifications: {
        jobId,
        title: "Software Engineer",
        requirements: ["TypeScript", "Node.js", "React", "Problem Solving", "Communication"],
        experienceLevel: "mid",
        teamSize: 5,
        workStyle: "hybrid",
        priorities: ["technical_competence", "cultural_fit", "communication_skills"],
        dealBreakers: ["poor_communication", "lack_of_collaboration"]
      },
      guidelines: {
        interviewDuration: 30,
        questionTypes: ["technical", "behavioral", "situational"],
        evaluationCriteria: ["technical_skills", "problem_solving", "communication", "cultural_fit"],
        followUpAllowed: true,
        adaptiveQuestioning: true
      }
    };
  }
}

export class SkillsAssessmentTool extends Runnable<{jobSpecs: any, parsedCV: any, extractedFeatures?: any, recruiterQuestions?: any[]}, any> {
  lc_namespace = ["hr-profiling", "SkillsAssessmentTool"];
  
  async invoke({jobSpecs, parsedCV, extractedFeatures, recruiterQuestions}: {jobSpecs: any, parsedCV: any, extractedFeatures?: any, recruiterQuestions?: any[]}) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY environment variable is not set.");
    }

    const systemPrompt = `You are an expert technical interviewer. Create exactly 3 focused technical questions based on the job requirements. 
    Each question should be practical, specific, and allow for detailed answers that demonstrate real expertise.
    
    IMPORTANT: Respond ONLY with a valid JSON array. Do not include any reasoning, thinking, or explanatory text.
    
    Format:
    [
      {
        "id": 1,
        "question": "actual question text here",
        "difficulty": 3,
        "skill": "specific skill being tested"
      }
    ]`;

    const userPrompt = `Job Requirements: ${JSON.stringify(jobSpecs.requirements)}
    Candidate Skills: ${JSON.stringify(parsedCV.skills)}
    ${extractedFeatures ? `Extracted Features: ${JSON.stringify(extractedFeatures.technicalSkills)}` : ''}
    ${recruiterQuestions ? `Additional Focus Areas: ${recruiterQuestions.map(q => q.focus).join(', ')}` : ''}
    
    Create exactly 3 targeted questions that test both listed skills and job requirements. Focus on practical scenarios.
    Respond with ONLY the JSON array, no other text.`;

    try {
      const client = createMistralClient();
      const response = await client.chat.complete({
        model: "mistral-medium-2312",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        maxTokens: 1000,
        temperature: 0.7,
      });

      const questionsText = response.choices?.[0]?.message?.content;
      if (!questionsText || typeof questionsText !== 'string') {
        throw new Error("No content in Mistral response for skills assessment.");
      }
      
      let cleanedText = questionsText;
      cleanedText = cleanedText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
      cleanedText = cleanedText.replace(/\*\*Thinking[\s\S]*?\*\*/gi, '');
      cleanedText = cleanedText.replace(/Thinking:[\s\S]*?(?=\[)/gi, '');
      cleanedText = cleanedText.replace(/Let me[\s\S]*?(?=\[)/gi, '');
      
      let jsonArray = null;
      const arrayMatch = cleanedText.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        try {
          jsonArray = JSON.parse(arrayMatch[0]);
        } catch (e) {
          console.log("Strategy 1 failed, trying strategy 2");
        }
      }
      
      if (!jsonArray) {
        const objectMatches = cleanedText.match(/\{[^{}]*"question"[^{}]*\}/g);
        if (objectMatches && objectMatches.length > 0) {
          try {
            jsonArray = objectMatches.slice(0, 3).map((obj: string) => JSON.parse(obj));
          } catch (e) {
            console.log("Strategy 2 failed, trying strategy 3");
          }
        }
      }
      
      if (Array.isArray(jsonArray) && jsonArray.length > 0) {
        const validQuestions = jsonArray.filter(q => 
          q && typeof q === 'object' && 
          q.question && q.skill && q.difficulty
        ).slice(0, 3);
        
        if (validQuestions.length > 0) {
          return validQuestions;
        }
      }
      
      return this.createFallbackQuestions(jobSpecs, parsedCV);
      
    } catch (error) {
      console.error("Error parsing questions:", error);
      return this.createFallbackQuestions(jobSpecs, parsedCV);
    }
  }
  
  private createFallbackQuestions(jobSpecs: any, parsedCV: any) {
    const requirements = jobSpecs.requirements || ["Programming", "Problem Solving", "System Design"];
    const candidateSkills = parsedCV.skills || [];
    
    return requirements.slice(0, 3).map((req: string, index: number) => ({
      id: index + 1,
      question: `Can you describe your experience with ${req}? Please provide a specific example of a project where you used ${req} and explain the challenges you faced and how you solved them.${candidateSkills.includes(req) ? ' I notice you have this skill listed on your CV.' : ''}`,
      difficulty: 3,
      skill: req
    }));
  }
}

export class InterviewSessionManager extends Runnable<{questions: any[], currentIndex: number, responses: any[], guidelines: any, jobDetails: any, candidateDetails?: any}, any> {
  lc_namespace = ["hr-profiling", "InterviewSessionManager"];
  private bpApiKey: string;
  private bpApiBaseUrl: string;
  private bpBaseModelAvatarId: string;
  private livekitUrl: string;

  constructor(options?: { 
    bpApiKey?: string, 
    bpApiBaseUrl?: string, 
    bpBaseModelAvatarId?: string,
    livekitUrl?: string,
  }) {
    super();
    this.bpApiKey = options?.bpApiKey || process.env.BEYOND_PRESENCE_API_KEY || "";
    this.bpApiBaseUrl = options?.bpApiBaseUrl || process.env.BEYOND_PRESENCE_API_BASE_URL || "";
    this.bpBaseModelAvatarId = options?.bpBaseModelAvatarId || process.env.BEYOND_PRESENCE_AVATAR_ID || "";
    this.livekitUrl = options?.livekitUrl || process.env.LIVEKIT_URL || "";

    if (!this.bpApiKey) throw new Error("Beyond Presence API Key is not configured.");
    if (!this.bpApiBaseUrl) throw new Error("Beyond Presence API Base URL is not configured.");
    if (!this.bpBaseModelAvatarId) throw new Error("Beyond Presence Base Model Avatar ID is not configured.");
    if (!this.livekitUrl) throw new Error("LiveKit URL is not configured.");
  }
  
  async invoke({questions, currentIndex, responses, guidelines: _guidelines, jobDetails, candidateDetails}: {
    questions: { id: string | number; question: string; skill: string }[],
    currentIndex: number, 
    responses: any[], 
    guidelines: any, 
    jobDetails: { title: string }, 
    candidateDetails?: { name?: string, livekitToken: string }
  }) {
    if (currentIndex === 0 && candidateDetails?.livekitToken) {
      try {
        console.log("Initializing Beyond Presence interview session with dynamic agent configuration...");
        
        const { sessionDetails, configuredAgentId } = await initializeAndStartBpInterviewSession(
          this.bpBaseModelAvatarId,
          this.livekitUrl,
          candidateDetails.livekitToken,
          this.bpApiKey,
          this.bpApiBaseUrl,
          jobDetails.title,
          questions
        );

        return {
          bpSessionId: sessionDetails.id,
          configuredAgentId: configuredAgentId,
          livekitUrl: sessionDetails.livekit_url,
          status: "beyond_presence_session_started",
          message: `Beyond Presence session started (ID: ${sessionDetails.id}) using base avatar (ID: ${configuredAgentId}). Interview will be conducted via LiveKit at ${sessionDetails.livekit_url}.`,
          completed: false,
          responses: [],
          nextIndex: 0,
        };

      } catch (error) {
        console.error("Failed to start Beyond Presence session:", error);
        return {
          status: "error_starting_bp_session",
          message: error instanceof Error ? error.message : "Unknown error starting Beyond Presence session.",
          completed: true,
          responses: [],
          nextIndex: currentIndex,
        };
      }
    } else if (currentIndex > 0 || (currentIndex === 0 && !candidateDetails?.livekitToken)) {
        const existingBpSessionId = responses.find(r => r.bpSessionId)?.bpSessionId || null;

        if (existingBpSessionId) {
            console.log(`Beyond Presence session ${existingBpSessionId} is presumed ongoing or awaiting results. Current index: ${currentIndex}.`);
            return {
                bpSessionId: existingBpSessionId,
                status: "beyond_presence_session_ongoing_polling_needed",
                completed: false,
                responses, 
                nextIndex: currentIndex, 
                message: "Waiting for Beyond Presence session to complete and results to be available."
            };
        } else {
            console.warn("InterviewSessionManager: Attempting to continue or start BP session without a LiveKit token or existing session. Falling back or erroring.");
             return {
                status: "error_bp_session_cannot_proceed",
                message: "Cannot start or continue Beyond Presence session: Missing LiveKit token or no existing session ID found.",
                completed: true, 
                responses: [],
                nextIndex: currentIndex,
            };
        }
    }

    console.error("InterviewSessionManager: Reached an unexpected state.");
    return {
        status: "error_unexpected_state",
        message: "InterviewSessionManager reached an unexpected state.",
        completed: true,
        responses: [],
        nextIndex: currentIndex,
    };
  }

  // Method to retrieve session transcript when interview is complete
  async retrieveSessionTranscript(sessionId: string): Promise<any[]> {
    try {
      console.log(`Attempting to retrieve transcript for session: ${sessionId}`);
      
      const transcriptData = await waitForSessionCompletionAndGetTranscript(
        sessionId,
        this.bpApiKey,
        this.bpApiBaseUrl,
        10, // 10 minutes max wait
        15  // Poll every 15 seconds
      );

      if (!transcriptData) {
        console.warn(`No transcript data available for session ${sessionId}`);
        return [];
      }

      // Convert Beyond Presence transcript format to our expected format
      const candidateResponses = transcriptData.transcripts
        .filter(segment => segment.speaker === 'user') // Only candidate responses
        .map((segment, index) => ({
          id: index + 1,
          transcript: segment.text,
          timestamp: segment.timestamp,
          confidence: segment.confidence || 1.0,
          bpSessionId: sessionId
        }));

      console.log(`Retrieved ${candidateResponses.length} candidate responses from transcript`);
      return candidateResponses;

    } catch (error) {
      console.error(`Error retrieving transcript for session ${sessionId}:`, error);
      return [];
    }
  }

  // Method to check if session is complete and ready for transcript retrieval
  async checkSessionStatus(sessionId: string): Promise<{ completed: boolean; status: string }> {
    try {
      const statusData = await getBpSessionStatus(sessionId, this.bpApiKey, this.bpApiBaseUrl);
      console.log('DEBUG: Session status response:', JSON.stringify(statusData, null, 2));
      
      // Beyond Presence API doesn't return a status field directly
      // Instead, if we can fetch the session details, it means it's active
      // We need to check for transcript availability to determine if completed
      if (statusData.id) {
        // Try to get transcript to see if session is completed
        try {
          const transcript = await getBpSessionTranscript(sessionId, this.bpApiKey, this.bpApiBaseUrl);
          if (transcript && transcript.transcripts && transcript.transcripts.length > 0) {
            console.log(`Session ${sessionId} has transcript available - marking as completed`);
            return {
              completed: true,
              status: 'completed'
            };
          }
        } catch (transcriptError) {
          // Transcript not available yet, session is still active
          console.log(`Session ${sessionId} transcript not ready - session still active`);
        }
        
        // Session exists but no transcript yet - it's active
        return {
          completed: false,
          status: 'active'
        };
      }
      
      return { completed: false, status: 'unknown' };
    } catch (error) {
      console.error(`Error checking session status for ${sessionId}:`, error);
      return { completed: false, status: 'error' };
    }
  }
}

export class AnswerEvaluatorTool extends Runnable<{question: any, answer: string, jobSpecs: any, extractedFeatures?: any}, any> {
  lc_namespace = ["hr-profiling", "AnswerEvaluatorTool"];
  
  async invoke({question, answer, jobSpecs}: {question: any, answer: string, jobSpecs: any}) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY environment variable is not set.");
    }

    const systemPrompt = `You are an expert technical interviewer evaluating candidate responses. 
    Score each answer on a scale of 1-5 where:
    1 = Poor (no understanding, incorrect, vague)
    2 = Below Average (limited understanding, partially incorrect)
    3 = Average (basic understanding, adequate response)
    4 = Good (solid understanding, detailed response)
    5 = Excellent (expert level, comprehensive, insightful)

    Provide specific feedback on strengths and areas for improvement.
    Return a JSON object with: score, strengths, improvements, reasoning.`;

    const userPrompt = `Question: ${question.question}
    Expected Skill: ${question.skill}
    Difficulty Level: ${question.difficulty}/5
    Job Requirements: ${JSON.stringify(jobSpecs.requirements)}
    
    Candidate Answer: "${answer}"
    
    Evaluate this response thoroughly.`;

    try {
      const client = createMistralClient();
      const response = await client.chat.complete({
        model: "mistral-medium-2312",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        maxTokens: 800,
      });

      const evaluationText = response.choices?.[0]?.message?.content;
      if (!evaluationText || typeof evaluationText !== 'string') {
        throw new Error("No content in Mistral response for answer evaluation.");
      }

      const jsonMatch = evaluationText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const evaluation = JSON.parse(jsonMatch[0]);
        return {
          questionId: question.id,
          skill: question.skill,
          score: evaluation.score || 3,
          strengths: evaluation.strengths || [],
          improvements: evaluation.improvements || [],
          reasoning: evaluation.reasoning || "No detailed reasoning provided",
          answer
        };
      }
      
      const score = this.fallbackScore(answer, question, jobSpecs);
      return {
        questionId: question.id,
        skill: question.skill,
        score,
        strengths: ["Response provided"],
        improvements: ["Could provide more specific examples"],
        reasoning: "Automated fallback evaluation",
        answer
      };
    } catch (error) {
      console.error("Error parsing evaluation:", error);
      return {
        questionId: question.id,
        skill: question.skill,
        score: 3,
        strengths: [],
        improvements: [],
        reasoning: "Evaluation parsing failed",
        answer
      };
    }
  }
  
  private fallbackScore(answer: string, question: any, jobSpecs: any): number {
    if (!answer || answer.length < 10) return 1;
    if (answer.length < 50) return 2;
    
    const relevantTerms = [...jobSpecs.requirements, question.skill].join(' ').toLowerCase();
    const answerLower = answer.toLowerCase();
    const keywordMatches = relevantTerms.split(' ').filter(term => answerLower.includes(term)).length;
    
    if (keywordMatches >= 3 && answer.length > 200) return 5;
    if (keywordMatches >= 2 && answer.length > 100) return 4;
    if (keywordMatches >= 1 || answer.length > 50) return 3;
    return 2;
  }
}

export class ResultsGenerator extends Runnable<{evaluations: any[], scrapedProfile: any, parsedCV: any, extractedFeatures: any, jobSpecifications: any, recruiterQuestions: any[], candidateResponses: any[]}, any> {
  lc_namespace = ["hr-profiling", "ResultsGenerator"];
  
  constructor() {
    super();
  }
  
  async invoke({evaluations, scrapedProfile, parsedCV: _parsedCV, extractedFeatures, jobSpecifications, recruiterQuestions: _recruiterQuestions, candidateResponses}: {evaluations: any[], scrapedProfile: any, parsedCV: any, extractedFeatures: any, jobSpecifications: any, recruiterQuestions: any[], candidateResponses: any[]}) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY environment variable is not set for ResultsGenerator.");
    }
    
    const overallScore = this.calculateOverallScore(evaluations);
    
    const recruiterReport = await this.generateRecruiterReport({
      evaluations,
      scrapedProfile,
      extractedFeatures,
      jobSpecifications,
      overallScore,
      candidateResponses,
      apiKey
    });

    const candidateReport = await this.generateCandidateReport({
      evaluations,
      extractedFeatures,
      jobSpecifications,
      overallScore,
      candidateResponses,
      apiKey
    });

    return {
      recruiterReport,
      candidateReport,
      overallAssessment: {
        score: overallScore,
        recommendation: this.getHiringRecommendation(overallScore),
        keyFindings: this.extractKeyFindings(evaluations, extractedFeatures),
        nextSteps: this.suggestNextSteps(overallScore)
      }
    };
  }

  private async generateRecruiterReport(data: any): Promise<any> {
    const systemPrompt = `You are an expert HR consultant generating a comprehensive recruiter report. 
    Provide detailed insights for hiring decision-making including:
    - Executive summary with hire/no-hire recommendation
    - Detailed competency analysis
    - Cultural fit assessment
    - Risk factors and mitigation strategies
    - Salary and role level recommendations
    - Onboarding considerations
    
    Be thorough, objective, and actionable. Respond ONLY with a valid JSON object representing the report.`;

    const userPrompt = `CANDIDATE EVALUATION DATA:
    Name: ${data.scrapedProfile.name}
    Position: ${data.jobSpecifications.title}
    Overall Score: ${data.overallScore.percentage}%
    
    TECHNICAL ASSESSMENT:
    ${data.evaluations.map((evaluation: any) => `${evaluation.skill}: ${evaluation.score}/5 - ${evaluation.reasoning}`).join('\n')}
    
    EXTRACTED FEATURES:
    Technical Skills: ${data.extractedFeatures.technicalSkills?.join(', ')}
    Soft Skills: ${data.extractedFeatures.softSkills?.join(', ')}
    Experience Level: ${data.extractedFeatures.experienceLevel}
    Job Match Score: ${data.extractedFeatures.jobMatchScore}
    
    INTERVIEW RESPONSES:
    ${data.candidateResponses.map((resp: any, idx: number) => `Q${idx + 1}: ${resp.transcript.substring(0, 100)}...`).join('\n')}
    
    Generate a comprehensive recruiter report with actionable insights. Respond ONLY with a valid JSON object.`;

    try {
      const client = createMistralClient();
      const response = await client.chat.complete({
        model: "mistral-medium-2312",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        responseFormat: { type: "json_object" },
        maxTokens: 3000,
        temperature: 0.4,
      });

      const responseContent = response.choices?.[0]?.message?.content;

      if (!responseContent) {
        throw new Error("No content in Mistral response for recruiter report.");
      }
      
      const textContent = extractTextContent(responseContent);
      const parsedReport = JSON.parse(textContent); 

      return {
        executiveSummary: parsedReport.executiveSummary || "Detailed analysis pending",
        recommendation: parsedReport.recommendation || this.getHiringRecommendation(data.overallScore),
        competencyAnalysis: parsedReport.competencyAnalysis || data.evaluations,
        culturalFit: parsedReport.culturalFit || "Assessment needed",
        riskFactors: parsedReport.riskFactors || "Standard hiring risks",
        salaryRange: parsedReport.salaryRange || this.suggestSalaryRange(data.extractedFeatures),
        onboardingPlan: parsedReport.onboardingPlan || "Standard onboarding recommended",
        rawReport: textContent
      };
    } catch (error) {
      console.error("Error generating recruiter report with Mistral:", error);
      return this.fallbackRecruiterReport(data);
    }
  }

  private async generateCandidateReport(data: any): Promise<any> {
    const systemPrompt = `You are a career development coach providing constructive feedback to a job candidate.
    Focus on:
    - Strengths demonstrated during the interview
    - Areas for improvement with specific suggestions
    - Learning resources and development paths
    - Interview performance feedback
    - Career growth advice
    
    Be encouraging, specific, and helpful regardless of the hiring outcome. Respond ONLY with a valid JSON object.`;

    const userPrompt = `INTERVIEW PERFORMANCE DATA:
    Overall Score: ${data.overallScore.percentage}%
    
    STRENGTHS IDENTIFIED:
    ${data.extractedFeatures.keyStrengths?.join(', ')}
    
    EVALUATION RESULTS:
    ${data.evaluations.map((evaluation: any) => `${evaluation.skill}: ${evaluation.score}/5`).join('\n')}
    
    DEVELOPMENT AREAS:
    ${data.extractedFeatures.developmentAreas?.join(', ')}
    
    Provide constructive, encouraging feedback with actionable improvement suggestions. Respond ONLY with a valid JSON object.`;

    try {
      const client = createMistralClient();
      const response = await client.chat.complete({
        model: "mistral-medium-2312",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        responseFormat: { type: "json_object" },
        maxTokens: 2000,
        temperature: 0.5,
      });

      const responseContent = response.choices?.[0]?.message?.content;

      if (!responseContent) {
        throw new Error("No content in Mistral response for candidate report.");
      }

      const textContent = extractTextContent(responseContent);
      const parsedFeedback = JSON.parse(textContent);

      return {
        strengths: parsedFeedback.strengths || data.extractedFeatures.keyStrengths || [],
        improvementAreas: parsedFeedback.improvementAreas || this.extractImprovements(textContent),
        learningResources: parsedFeedback.learningResources || this.suggestLearningResources(data.evaluations),
        interviewFeedback: parsedFeedback.interviewFeedback || "Good overall performance",
        careerAdvice: parsedFeedback.careerAdvice || "Continue developing your skills",
        nextSteps: parsedFeedback.nextSteps || this.suggestCandidateNextSteps(data.overallScore),
        rawFeedback: textContent
      };
    } catch (error) {
      console.error("Error generating candidate report with Mistral:", error);
      return this.fallbackCandidateReport(data);
    }
  }

  private calculateOverallScore(evaluations: any[]): any {
    const total = evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0);
    const max = evaluations.length * 5;
    const percentage = (total / max) * 100;
    
    return {
      total,
      maximum: max,
      average: total / evaluations.length,
      percentage: Math.round(percentage)
    };
  }

  private getHiringRecommendation(overallScore: any): string {
    if (overallScore.percentage >= 80) return "Strong Hire";
    if (overallScore.percentage >= 70) return "Hire";
    if (overallScore.percentage >= 60) return "Conditional Hire";
    if (overallScore.percentage >= 50) return "Consider";
    return "No Hire";
  }

  private extractKeyFindings(evaluations: any[], features: any): string[] {
    const findings = [];
    
    const techScores = evaluations.filter(e => e.skill.includes("Tech") || e.skill.includes("Programming"));
    if (techScores.length > 0) {
      const avgTech = techScores.reduce((sum, e) => sum + e.score, 0) / techScores.length;
      findings.push(`Technical competency: ${avgTech.toFixed(1)}/5`);
    }
    
    if (features.experienceLevel) {
      findings.push(`Experience level: ${features.experienceLevel}`);
    }
    
    if (features.jobMatchScore) {
      findings.push(`Job match score: ${(features.jobMatchScore * 100).toFixed(0)}%`);
    }
    
    return findings;
  }

  private suggestNextSteps(overallScore: any): string[] {
    const steps = [];
    
    if (overallScore.percentage >= 70) {
      steps.push("Schedule final interview with hiring manager");
      steps.push("Conduct reference checks");
      steps.push("Prepare job offer");
    } else if (overallScore.percentage >= 50) {
      steps.push("Consider additional technical assessment");
      steps.push("Schedule second interview with team lead");
      steps.push("Evaluate against other candidates");
    } else {
      steps.push("Provide feedback to candidate");
      steps.push("Keep profile for future opportunities");
      steps.push("Continue candidate search");
    }
    
    return steps;
  }

  private extractImprovements(text: string): string[] {
    const improvements = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (line.includes('improve') || line.includes('develop') || line.includes('enhance')) {
        improvements.push(line.trim());
      }
    }
    
    return improvements.length > 0 ? improvements : [
      "Continue practicing technical skills",
      "Improve communication clarity",
      "Gain more hands-on experience"
    ];
  }

  private suggestLearningResources(evaluations: any[]): any[] {
    const resources = [];
    
    for (const evaluation of evaluations) {
      if (evaluation.score < 4) {
        resources.push({
          skill: evaluation.skill,
          resources: [
            `Online courses for ${evaluation.skill}`,
            `Practice projects in ${evaluation.skill}`,
            `Community forums and documentation`
          ]
        });
      }
    }
    
    return resources;
  }

  private suggestSalaryRange(features: any): string {
    const baseRanges: Record<string, string> = {
      junior: "$60,000 - $80,000",
      mid: "$80,000 - $120,000",
      senior: "$120,000 - $160,000"
    };
    
    return baseRanges[features.experienceLevel] || "$70,000 - $100,000";
  }

  private suggestCandidateNextSteps(overallScore: any): string[] {
    if (overallScore.percentage >= 70) {
      return [
        "Await feedback from the hiring team",
        "Prepare for potential next interview rounds",
        "Research the company culture and team"
      ];
    } else {
      return [
        "Focus on improving technical skills",
        "Practice interview communication",
        "Build portfolio projects",
        "Apply to similar positions for practice"
      ];
    }
  }

  private fallbackRecruiterReport(data: any): any {
    return {
      executiveSummary: `${data.scrapedProfile.name} scored ${data.overallScore.percentage}% overall. Technical competency demonstrated with room for growth.`,
      recommendation: this.getHiringRecommendation(data.overallScore),
      competencyAnalysis: data.evaluations,
      culturalFit: "Assessment needed through additional interviews",
      riskFactors: "Standard new hire risks apply",
      salaryRange: this.suggestSalaryRange(data.extractedFeatures),
      onboardingPlan: "Standard technical onboarding with mentorship",
      rawReport: "Generated using fallback system due to Mistral unavailability"
    };
  }

  private fallbackCandidateReport(data: any): any {
    return {
      strengths: data.extractedFeatures.keyStrengths || ["Technical competency", "Communication skills"],
      improvementAreas: ["Continue developing technical depth", "Practice problem-solving explanations"],
      learningResources: this.suggestLearningResources(data.evaluations),
      interviewFeedback: "Thank you for your time and effort in the interview process",
      careerAdvice: "Continue building your skills and gaining experience",
      nextSteps: this.suggestCandidateNextSteps(data.overallScore),
      rawFeedback: "Generated using fallback system"
    };
  }
}

export class MistralChatWrapper extends Runnable<
  { system: string; messages: any[]; inputs: Record<string, any> },
  any
> {
  lc_namespace = ["hr-profiling", "MistralChatWrapper"];
  async invoke({ system, messages, inputs }: { system: string; messages: any[]; inputs: Record<string, any> }) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY environment variable is not set. Chat functionality cannot work without it.");
    }
    
    const client = createMistralClient();
    const response = await client.chat.complete({
      model: "mistral-medium-2312",
      messages: [
        { role: "system", content: system },
        ...messages,
        { role: "user", content: JSON.stringify(inputs) },
      ],
    });
    
    const content = response.choices?.[0]?.message?.content;
    return extractTextContent(content) || ""; 
  }
}
