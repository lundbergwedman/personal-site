import Anthropic from '@anthropic-ai/sdk';
import { PROFILE } from './profile.js';

const ALLOWED_ORIGINS = new Set([
  'https://lundbergwedman.com',
  'https://www.lundbergwedman.com',
  'http://localhost:8000',
]);
const MAX_MESSAGES = 11;
const MAX_QUESTION = 500;
const MAX_ANSWER = 6000;

const SYSTEM = `You are the assistant on Gabriel Lundberg Wedman's personal website. Visitors ask you about Gabriel, his story and his projects. Answer using only the profile below.

Talk about Gabriel in the third person, in a warm and direct tone. Keep answers short: usually two to four sentences, and only longer when someone asks for detail. Reply in plain text without Markdown, since the site renders it in a terminal. Answer in the language the visitor writes in.

If the profile doesn't cover something, say you don't know and suggest emailing Gabriel at gabriel@lundbergwedman.com rather than guessing. If someone asks for help with something unrelated to Gabriel, briefly say that you're only here to talk about him and his work.

<profile>
${PROFILE.trim()}
</profile>`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// Accepts the visitor's conversation only if it alternates user/assistant,
// starts and ends with the user, and stays within the size limits.
function readMessages(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
  const valid = messages.every((message, index) => {
    const role = index % 2 === 0 ? 'user' : 'assistant';
    const limit = role === 'user' ? MAX_QUESTION : MAX_ANSWER;
    return message?.role === role
      && typeof message.content === 'string'
      && message.content.trim().length > 0
      && message.content.length <= limit;
  });
  if (!valid || messages.length % 2 === 0) return null;
  return messages.map(({ role, content }) => ({ role, content }));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.has(origin)) return new Response('Forbidden', { status: 403 });
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

    if (env.ASK_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.ASK_LIMITER.limit({ key: ip });
      if (!success) return new Response('Too many requests', { status: 429, headers: cors });
    }

    const messages = readMessages(await request.json().catch(() => null));
    if (!messages) return new Response('Bad request', { status: 400, headers: cors });

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const stream = client.beta.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages,
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === 'refusal') {
            controller.enqueue(encoder.encode("\n\nI can't help with that one. Ask me something about Gabriel instead."));
          }
        } catch (error) {
          console.error(error);
          controller.enqueue(encoder.encode('\n\n⎿ Something went wrong. Try again, or email gabriel@lundbergwedman.com.'));
        }
        controller.close();
      },
    });

    return new Response(body, {
      headers: {
        ...cors,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  },
};
