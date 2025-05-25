import { fileURLToPath } from 'node:url';
import { cli, defineAgent, multimodal, WorkerOptions, type JobContext } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { z } from 'zod';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const participant = await ctx.waitForParticipant();

    console.log(`starting interview agent for ${participant.identity}`);

    const model = new openai.realtime.RealtimeModel({
      instructions: `You are an experienced technical interviewer. Your role is to:
      1. Start with a brief introduction and explain the interview process
      2. Ask relevant technical questions based on the candidate's responses
      3. Follow up on answers to dig deeper into the candidate's knowledge
      4. Provide constructive feedback
      5. Be professional but approachable
      6. Give the candidate time to think and respond
      7. Take notes on the candidate's performance
      8. End the interview with next steps and thank the candidate`,
      voice: "shimmer",
      temperature: 0.7,
    });

    const agent = new multimodal.MultimodalAgent({
      model,
    });

    const session = await agent
      .start(ctx.room, participant)
      .then((session) => session as openai.realtime.RealtimeSession);

    // Start the interview with an introduction
    session.conversation.item.create({
      role: openai.llm.ChatRole.ASSISTANT,
      content: 'Hello! I will be conducting your technical interview today. I\'d like to start by learning about your background and what interests you about this position. Please take your time to share your experience with me.',
    });
    session.response.create();
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
