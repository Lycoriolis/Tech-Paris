import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';

const elevenlabsTts = new elevenlabs.TTS({
  modelID: "eleven_turbo_v2_5",
  voice: {
    id: "DEFAULT_VOICE",
    name: "Default",
    category: "premade",
    settings: {
      stability: 0.75,
      similarity_boost: 0.75,
      use_speaker_boost: true
    },
  },
});