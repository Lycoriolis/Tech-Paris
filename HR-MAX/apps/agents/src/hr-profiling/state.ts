import { Annotation, messagesStateReducer } from "@langchain/langgraph";

// Annotation schema for HR Profiling graph state
export const StateAnnotation = Annotation.Root({
  profileUrl: Annotation<string>(),
  scrapedProfile: Annotation<any>(),
  cvFile: Annotation<any>(),
  ocrText: Annotation<string>(),
  parsedCV: Annotation<any>(),
  jobId: Annotation<string>(),
  jobSpecs: Annotation<any>(),
  profileData: Annotation<any>(),
  messages: Annotation<any[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  userMessage: Annotation<string>(),
});
