// NOTE:
// This file intentionally avoids importing the `@google/genai` package at module
// top-level so that the client-side bundle does not attempt to initialize the
// SDK in the browser (which will throw when no API key is present).
//
// Recommended production approach:
// - Create a server-side endpoint (serverless function or API route) that holds
//   the API key in environment variables and calls @google/genai. The client
//   should call that endpoint. See README or comments below for next steps.

// For now, export a startChat function that returns a small "mock" chat object
// when used in the browser so the app can load without crashing. Replace with
// a server proxy in production.

type SendResponse = { text: string };

// Client-side wrapper that proxies requests to a Netlify Function.
// The function endpoint is expected at '/.netlify/functions/genai'.
export const startChat = (systemInstruction?: string) => {
  return {
    async sendMessage({ message }: { message: string }): Promise<SendResponse> {
      const res = await fetch('/.netlify/functions/genai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, systemInstruction }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Server error: ${res.status} ${errBody}`);
      }

      const data = await res.json();
      return { text: data.text };
    },
  };
};