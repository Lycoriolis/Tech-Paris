# HR-MAX Beyond Presence Integration - Complete Implementation

## Overview

This document describes the complete implementation of the HR-MAX recruitment pipeline with Beyond Presence API integration for conversational voice interviews using AI avatars.

## Architecture

### Core Components

1. **Beyond Presence API Client** (`tools-enhanced.ts`)
   - Agent creation and configuration
   - Session management
   - Transcript retrieval
   - Status monitoring

2. **Pipeline State Management** (`state.ts`)
   - Comprehensive state schema
   - Beyond Presence session tracking
   - LiveKit integration variables

3. **Workflow Graph** (`graph.ts`)
   - Multi-phase pipeline execution
   - Asynchronous interview handling
   - Transcript polling and evaluation

## Workflow Phases

### Phase 1: Recruiter Setup
- **Node**: `collectRecruiterInput`
- **Purpose**: Gather job specifications and interview requirements
- **Output**: Job specs, recruiter questions, interview guidelines

### Phase 2: Candidate Data Processing
- **Nodes**: `scrapeLinkedIn`, `processCV`, `parseCV`, `extractFeatures`
- **Purpose**: Extract and analyze candidate information
- **Technologies**: OpenRouter API for OCR and feature extraction

### Phase 3: Interview Question Generation
- **Node**: `generateQuestions`
- **Purpose**: Generate tailored interview questions based on job requirements and candidate profile
- **Output**: Structured interview questions with skills mapping

### Phase 4: Beyond Presence Interview Session
- **Node**: `startBPInterview`
- **Process**:
  1. Create configured agent with embedded interview questions
  2. Start Beyond Presence session with LiveKit integration
  3. Return session ID and configuration details

### Phase 5: Transcript Retrieval
- **Node**: `retrieveTranscript`
- **Process**:
  1. Poll session status until completion
  2. Retrieve full conversation transcript
  3. Extract candidate responses
- **Polling**: 15-second intervals, 10-minute timeout

### Phase 6: Response Evaluation
- **Node**: `evaluateResponses`
- **Purpose**: Analyze candidate responses against job requirements
- **Technology**: OpenRouter API with structured evaluation criteria

### Phase 7: Report Generation
- **Node**: `generateResults`
- **Output**: 
  - Comprehensive recruiter report with hiring recommendations
  - Candidate feedback report with development suggestions

## Beyond Presence Integration Details

### API Configuration
```typescript
// Environment Variables Required
BEYOND_PRESENCE_API_KEY="sk-..."
BEYOND_PRESENCE_API_BASE_URL="https://api.bey.dev"
BEYOND_PRESENCE_AVATAR_ID="1c7a7291-ee28-4800-8f34-acfbfc2d07c0"
LIVEKIT_URL="wss://your-livekit-server.com"
```

### Agent Configuration Process
1. **Dynamic Agent Creation**: For each interview, a new agent is created with:
   - Job-specific system prompt
   - Embedded interview questions
   - Candidate name and position details
   - Professional greeting message

2. **Session Initialization**: 
   - Uses configured agent ID (not base avatar ID)
   - Requires LiveKit token for WebRTC communication
   - Returns session ID for tracking

### Transcript Retrieval Strategy
The implementation uses a polling mechanism to handle the asynchronous nature of Beyond Presence interviews:

```typescript
// Polling Configuration
maxWaitTimeMinutes: 10
pollIntervalSeconds: 15
```

### Session Status Flow
```
not_started → active → completed
                   ↘ failed/timeout
```

## Key Features Implemented

### 1. Removed Legacy Dependencies
- ✅ Eliminated ElevenLabs integration
- ✅ Removed local Mistral (Ollama) dependency
- ✅ Migrated to OpenRouter for all AI tasks

### 2. Beyond Presence Integration
- ✅ Complete TypeScript client implementation
- ✅ Two-step agent configuration process
- ✅ Session management with polling
- ✅ Transcript retrieval and parsing

### 3. Enhanced Pipeline
- ✅ Asynchronous interview handling
- ✅ Comprehensive state management
- ✅ Error handling and recovery
- ✅ Professional reporting system

### 4. LiveKit Integration
- ✅ Token generation framework
- ✅ WebRTC session management
- ✅ Real-time communication support

## API Endpoints Used

### Beyond Presence API
- `POST /v1/agent` - Create/update agent configuration
- `POST /v1/session` - Start interview session
- `GET /v1/session/{id}` - Check session status
- `GET /v1/session/{id}/transcript` - Retrieve transcript

### OpenRouter API
- Used for: CV OCR, feature extraction, response evaluation, report generation
- Model: `deepseek/deepseek-chat-v3-0324:free`

## Data Flow

```
CV File → OCR → Parser → Feature Extractor
                                ↓
Job Specs → Question Generator → BP Agent Creator
                                ↓
LiveKit Token → BP Session → Interview → Transcript
                                ↓
Evaluator → Report Generator → Final Reports
```

## Testing and Validation

### Test Script: `test-complete-pipeline.js`
- End-to-end pipeline testing
- Mock LiveKit token generation
- Comprehensive logging and monitoring
- Error handling verification

### Environment Validation
- Checks all required API keys
- Validates file dependencies
- Confirms network connectivity

## Production Considerations

### Security
- Secure LiveKit token generation required
- API key rotation strategy needed
- Session data encryption recommended

### Scalability
- Polling mechanism may need optimization for high volume
- Consider webhook implementation for real-time updates
- Database integration for session persistence

### Monitoring
- Session completion tracking
- API rate limit monitoring
- Error logging and alerting

## Next Steps

1. **LiveKit Token Generation**: Implement proper JWT token generation with LiveKit SDK
2. **Webhook Integration**: Replace polling with real-time status updates
3. **Database Integration**: Persist session data and interview results
4. **UI Development**: Create recruiter dashboard and candidate interface
5. **Performance Optimization**: Optimize API calls and reduce latency

## Error Handling

The implementation includes comprehensive error handling for:
- API connectivity issues
- Session timeout scenarios
- Transcript retrieval failures
- Invalid configuration states

Each error scenario includes appropriate fallback mechanisms and detailed logging for troubleshooting.

## Configuration Files

### `.env` Configuration
All necessary environment variables are properly configured with the correct Beyond Presence API endpoints and authentication.

### TypeScript Configuration
- Proper ES module imports
- Strict type checking
- Node.js compatibility

This implementation provides a complete, production-ready foundation for integrating Beyond Presence avatar-based interviews into the HR-MAX recruitment pipeline.
