import { Annotation } from "@langchain/langgraph";

// Define the state schema for the HR profiling pipeline
export const PipelineState = Annotation.Root({
  // Input data
  cvFile: Annotation<Buffer | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  jobId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  mode: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "automated",
  }),
  linkedinUrl: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),

  // Processing results
  ocrText: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  scrapedProfile: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  parsedCV: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  jobSpecifications: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  extractedFeatures: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // Recruiter input
  recruiterQuestions: Annotation<any[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  interviewGuidelines: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // Interview process
  generatedQuestions: Annotation<any[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  currentQuestionIndex: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  candidateResponses: Annotation<any[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  audioFiles: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),

  // Beyond Presence session management
  bpSessionId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  configuredAgentId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  livekitUrl: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  livekitToken: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  bpSessionStatus: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "not_started",
  }),

  // Interview session management
  interviewSessionId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  interviewComplete: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),

  // Evaluation results
  evaluations: Annotation<any[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),

  // Final reports
  recruiterReport: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  candidateReport: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // Pipeline control
  currentStage: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "initialization",
  }),
  errors: Annotation<string[]>({
    reducer: (x, y) => [...(x || []), ...(y || [])],
    default: () => [],
  }),

  // Candidate details
  candidateName: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  candidateEmail: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
});

export type PipelineStateType = typeof PipelineState.State;