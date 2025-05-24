import { StateGraph } from "@langchain/langgraph";
import { StateAnnotation } from "./state.js";
import {
  LinkedInScraper,
  CVOCRTool,
  ATSParser,
  JobSpecLoader,
  OpenRouterChatWrapper,
} from "./tools.js";

const builder = new StateGraph(
  StateAnnotation,
)
  .addNode("init", async (state) => {
    // initialize chat messages with first user message
    return { messages: [{ role: "user", content: state.userMessage }] };
  })
  .addNode("scrapeLinkedIn", async (state) => {
    const scraped = await new LinkedInScraper().invoke(state.profileUrl);
    return { scrapedProfile: scraped };
  })
  .addNode("processCV", async (state) => {
    const text = await new CVOCRTool().invoke(state.cvFile);
    return { ocrText: text };
  })
  .addNode("parseCV", async (state) => {
    const parsed = await new ATSParser().invoke(state.ocrText);
    return { parsedCV: parsed };
  })
  .addNode("loadJob", async (state) => {
    const specs = await new JobSpecLoader().invoke(state.jobId);
    return { jobSpecs: specs };
  })
  .addNode("generateProfile", async (state) => {
    const system = "Generate an HR profile for this candidate vs job spec.";
    const resp = await new OpenRouterChatWrapper().invoke({
      system,
      messages: [],
      inputs: {
        scrapedProfile: state.scrapedProfile,
        parsedCV: state.parsedCV,
        jobSpecs: state.jobSpecs,
      },
    });
    return { profileData: resp };
  })
  .addNode("chat", async (state) => {
    const system = "You are an audio‐capable agent talking to a candidate.";
    const bot = await new OpenRouterChatWrapper().invoke({
      system,
      messages: [{ role: "user", content: state.userMessage }],
      inputs: { profileData: state.profileData },
    });
    return { messages: [...state.messages, bot] };
  })
  .addEdge("__start__", "init")
  .addEdge("init", "scrapeLinkedIn")
  .addEdge("scrapeLinkedIn", "processCV")
  .addEdge("processCV", "parseCV")
  .addEdge("parseCV", "loadJob")
  .addEdge("loadJob", "generateProfile")
  .addEdge("generateProfile", "chat");

// compile/export
export const hrGraph = builder.compile({
  interruptBefore: [],
  interruptAfter: [],
});
hrGraph.name = "HR Profiling Agent";
