import { StateGraph } from "@langchain/langgraph";
import { PipelineState } from "./state.js";
import {
  LinkedInScraper,
  CVOCRTool,
  ATSParser,
  MistralFeatureExtractor,
  SkillsAssessmentTool,
  AnswerEvaluatorTool,
  RecruiterInputCollector,
  InterviewSessionManager,
  ResultsGenerator,
  generateCandidateLiveKitToken,
} from "./tools-enhanced.js";

const builder = new StateGraph(PipelineState)
  // Phase 1: Recruiter Setup
  .addNode("collectRecruiterInput", async (state) => {
    const collector = new RecruiterInputCollector();
    const recruiterData = await collector.invoke({
      jobId: state.jobId,
      mode: "collect_requirements"
    });
    return { 
      recruiterQuestions: recruiterData.questions,
      jobSpecifications: recruiterData.specifications,
      interviewGuidelines: recruiterData.guidelines,
      currentStage: "recruiter_setup_complete"
    };
  })
  
  // Phase 2: Candidate Data Processing
  .addNode("scrapeLinkedIn", async (state) => {
    // Load job specifications if not already loaded (when mode is "interview")
    let jobSpecifications = state.jobSpecifications;
    if (!jobSpecifications) {
      const collector = new RecruiterInputCollector();
      const recruiterData = await collector.invoke({
        jobId: state.jobId,
        mode: "collect_requirements"
      });
      jobSpecifications = recruiterData.specifications;
    }

    if (!state.linkedinUrl) {
      return { 
        jobSpecifications,
        currentStage: "profile_skipped" 
      };
    }
    const scraped = await new LinkedInScraper().invoke(state.linkedinUrl);
    return { 
      scrapedProfile: scraped, 
      jobSpecifications,
      currentStage: "profile_scraped" 
    };
  })
  .addNode("processCV", async (state) => {
    if (!state.cvFile) {
      throw new Error("CV file is required for processing");
    }
    const text = await new CVOCRTool().invoke(state.cvFile);
    return { ocrText: text, currentStage: "cv_processed" };
  })
  .addNode("parseCV", async (state) => {
    const parsed = await new ATSParser().invoke(state.ocrText);
    return { parsedCV: parsed, currentStage: "cv_parsed" };
  })
  .addNode("extractFeatures", async (state) => {
    const extractor = new MistralFeatureExtractor();
    const features = await extractor.invoke({
      ocrText: state.ocrText,
      scrapedProfile: state.scrapedProfile,
      jobSpecifications: state.jobSpecifications
    });
    return { extractedFeatures: features, currentStage: "features_extracted" };
  })
  
  // Phase 3: Interview Question Generation
  .addNode("generateQuestions", async (state) => {
    const assessment = new SkillsAssessmentTool();
    const questions = await assessment.invoke({
      jobSpecs: state.jobSpecifications,
      parsedCV: state.parsedCV,
      extractedFeatures: state.extractedFeatures,
      recruiterQuestions: state.recruiterQuestions
    });
    return { 
      generatedQuestions: questions,
      currentQuestionIndex: 0,
      candidateResponses: [],
      currentStage: "questions_generated"
    };
  })
  
  // Phase 4: Start Beyond Presence Interview Session
  .addNode("startBPInterview", async (state) => {
    const sessionManager = new InterviewSessionManager();
    
    // Generate LiveKit token if not provided
    let livekitToken = state.livekitToken;
    if (!livekitToken && state.candidateName) {
      livekitToken = await generateCandidateLiveKitToken(state.candidateName);
      console.log(`Generated LiveKit token for candidate: ${state.candidateName}`);
    }
    
    if (!livekitToken) {
      throw new Error("LiveKit token is required for Beyond Presence interview session");
    }
    
    // Start Beyond Presence session
    const sessionResult = await sessionManager.invoke({
      questions: state.generatedQuestions,
      currentIndex: 0,
      responses: [],
      guidelines: state.interviewGuidelines,
      jobDetails: { title: state.jobSpecifications?.title || "Unknown Position" },
      candidateDetails: { 
        name: state.candidateName,
        livekitToken: livekitToken
      }
    });
    
    return {
      bpSessionId: sessionResult.bpSessionId,
      configuredAgentId: sessionResult.configuredAgentId,
      bpSessionStatus: sessionResult.status,
      livekitToken: livekitToken, // Store the token in state
      interviewComplete: false,
      currentStage: "bp_interview_started"
    };
  })

  // Phase 5: Wait for Interview Completion and Retrieve Transcript
  .addNode("retrieveTranscript", async (state) => {
    const sessionManager = new InterviewSessionManager();
    
    if (!state.bpSessionId) {
      throw new Error("No Beyond Presence session ID found");
    }

    // Check session status
    const statusCheck = await sessionManager.checkSessionStatus(state.bpSessionId);
    
    if (!statusCheck.completed) {
      // Session not complete yet, return current state to continue polling
      return {
        bpSessionStatus: statusCheck.status,
        currentStage: "bp_interview_in_progress"
      };
    }

    // Session completed, retrieve transcript
    const candidateResponses = await sessionManager.retrieveSessionTranscript(state.bpSessionId);
    
    return {
      candidateResponses,
      bpSessionStatus: "completed",
      interviewComplete: true,
      currentStage: "transcript_retrieved"
    };
  })
  
  // Phase 6: Evaluation and Assessment
  .addNode("evaluateResponses", async (state) => {
    const evaluator = new AnswerEvaluatorTool();
    const evaluations = [];
    
    for (let i = 0; i < state.candidateResponses.length && i < state.generatedQuestions.length; i++) {
      const evaluation = await evaluator.invoke({
        question: state.generatedQuestions[i],
        answer: state.candidateResponses[i].transcript,
        jobSpecs: state.jobSpecifications
      });
      evaluations.push(evaluation);
    }
    
    return { 
      evaluations,
      currentStage: "responses_evaluated"
    };
  })
  
  // Phase 7: Generate Comprehensive Results
  .addNode("generateResults", async (state) => {
    const generator = new ResultsGenerator();
    const results = await generator.invoke({
      evaluations: state.evaluations,
      scrapedProfile: state.scrapedProfile,
      parsedCV: state.parsedCV,
      extractedFeatures: state.extractedFeatures,
      jobSpecifications: state.jobSpecifications,
      recruiterQuestions: state.recruiterQuestions,
      candidateResponses: state.candidateResponses
    });
    
    return {
      recruiterReport: results.recruiterReport,
      candidateReport: results.candidateReport,
      currentStage: "results_generated"
    };
  })
  // Define the workflow edges based on mode
  .addConditionalEdges("__start__", (state) => {
    if (state.mode === "recruiter_setup") {
      return "collectRecruiterInput";
    } else if (state.mode === "interview") {
      return "scrapeLinkedIn";
    } else {
      return "generateResults";
    }
  })
  
  // Recruiter setup flow
  .addEdge("collectRecruiterInput", "scrapeLinkedIn")
  
  // Main processing flow
  .addEdge("scrapeLinkedIn", "processCV")
  .addEdge("processCV", "parseCV")
  .addEdge("parseCV", "extractFeatures")
  .addEdge("extractFeatures", "generateQuestions")
  .addEdge("generateQuestions", "startBPInterview")
  
  // Beyond Presence interview flow
  .addEdge("startBPInterview", "retrieveTranscript")
  
  // Conditional edge for transcript retrieval (may need to wait/poll)
  .addConditionalEdges("retrieveTranscript", (state) => {
    if (state.interviewComplete) {
      return "evaluateResponses";
    } else {
      // Continue polling for completion
      return "retrieveTranscript";
    }
  })
  
  // Final evaluation and results
  .addEdge("evaluateResponses", "generateResults");

export const hrProfilingGraph = builder.compile();
