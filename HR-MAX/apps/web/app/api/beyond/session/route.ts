import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Beyond Presence request body:", body);

    const response = await fetch('https://api.bey.dev/v1/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.NEXT_PUBLIC_BP_KEY || '',
      },
      body: JSON.stringify({
        avatar_id: process.env.NEXT_PUBLIC_BEYOND_AVATAR_ID,
        livekit_url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
        livekit_token: body.livekit_token,
      }),
    });

    const data = await response.json();
    console.log("Beyond Presence API response:", {
      status: response.status,
      data: data
    });

    if (!response.ok) {
      console.error("Beyond Presence API error:", data);
      return NextResponse.json(
        { error: 'Failed to create session', details: data },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in beyond session proxy:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
} 