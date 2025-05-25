'use client';

import { useEffect, useState } from 'react';
import useStore from '@/app/state/store';
import { useParams } from 'next/navigation';
import {
  ControlBar,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  RoomContext,
  useVoiceAssistant
} from '@livekit/components-react';
import { useDisconnectButton } from "@livekit/components-react";
import { Room, Track } from 'livekit-client';
import '@livekit/components-styles';

// Create a separate component for the room content
function RoomContent({ roomId }: { roomId: string }) {
  const { username } = useStore();
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const { agent, state: agentState } = useVoiceAssistant();

  const handleAddAgent = async () => {
    setAgentLoading(true);
    setAgentError(null);
    try {
      if (agent) {
        console.log('Agent is already in the room');
        setAgentError('Agent is already present in the room');
        return;
      }

      const tokenResponse = await fetch(`/api/token?room=${roomId}&username=ai-agent`);
      if (!tokenResponse.ok) throw new Error('Failed to get agent token');
      const { token } = await tokenResponse.json();

      // Define agent knowledge and personality
      const agentConfig = {
        livekit_token: token,
        agent_type: 'interviewer',
        voice_provider: 'elevenlabs',
        voice_settings: {
          voice_id: "EXAVITQu4vr4xnSDxMaL",
          model: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.71,
            similarity_boost: 0.5,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        // Add knowledge base and personality
        knowledge_base: {
          documents: [
            {
              content: "Your custom knowledge content here",
              metadata: { source: "company_docs" }
            }
          ]
        },
        agent_configuration: {
          personality: "professional and friendly",
          role: "technical interviewer",
          background: "Experienced in conducting technical interviews",
          instructions: [
            "Speak in a professional but approachable manner",
            "Ask relevant technical questions",
            "Provide constructive feedback"
          ],
          conversation_style: {
            tone: "professional",
            speaking_pace: "moderate",
            interaction_style: "engaging"
          }
        }
      };

      const response = await fetch('/api/beyond/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentConfig),
      });

      if (!response.ok) {
        throw new Error('Failed to create agent session');
      }

      const sessionData = await response.json();
      console.log('Agent session created:', sessionData);

    } catch (e: any) {
      console.error('Agent creation error:', e);
      setAgentError(e.message || 'Failed to add AI agent');
    } finally {
      setAgentLoading(false);
    }
  };

  return (
    <div data-lk-theme="default" style={{ height: '100dvh' }}>
      <div className="flex gap-2 p-4">
        <button
          onClick={handleAddAgent}
          disabled={agentLoading || agent !== undefined}
          className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
        >
          {agentLoading ? 'Adding AI Agent...' : agent ? `AI Agent (${agentState})` : 'Add AI Agent'}
        </button>
        {agentError && <span className="text-red-500 ml-2">{agentError}</span>}
      </div>
      <MyVideoConference />
      <RoomAudioRenderer />
      <ControlBar />
    </div>
  );
}

export default function Page() {
  const params = useParams();
  const roomId = params.roomId as string;
  const { username } = useStore();
  const [roomInstance] = useState(() => new Room({
    adaptiveStream: true,
    dynacast: true,
  }));

  useEffect(() => {
    let mounted = true;

    const initializeSession = async () => {
      try {
        const tokenResponse = await fetch(`/api/token?room=${roomId}&username=${username}`);
        if (!tokenResponse.ok) {
          throw new Error('Failed to get LiveKit token');
        }
        const { token } = await tokenResponse.json();
        
        const response = await fetch('/api/beyond/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            livekit_token: token,
          })
        });

        if (!response.ok) {
          throw new Error('Failed to create session');
        }

        const sessionData = await response.json();
        await roomInstance.connect(sessionData.livekit_url as string, sessionData.livekit_token as string);

      } catch (e) {
        console.error('Session initialization error:', e);
      }
    };

    initializeSession();

    return () => {
      mounted = false;
      roomInstance.disconnect();
    };
  }, [roomId, username]);

  return (
    <RoomContext.Provider value={roomInstance}>
      <RoomContent roomId={roomId} />
    </RoomContext.Provider>
  );
}

function MyVideoConference() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} style={{ height: 'calc(100vh - var(--lk-control-bar-height))' }}>
      <ParticipantTile />
    </GridLayout>
  );
}