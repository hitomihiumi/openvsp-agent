import {
  createUIMessageStream,
  streamText,
  stepCountIs,
  UI_MESSAGE_STREAM_HEADERS,
} from 'ai';
import { google } from '@ai-sdk/google';
import express from 'express';
import cors from 'cors';
import { tools } from './tools/definitions.js';

const SYSTEM_PROMPT = `You are a Supervisor AI aircraft design agent.
You operate OpenVSP for conceptual fixed-wing aircraft design.

CRITICAL: To save time, you must delegate the exploration to sub-agents. 
1. Use the "delegateExploration" tool to spawn up to 5 sub-agents in parallel. Give each sub-agent a DISTINCT design strategy with specific parameter targets (e.g., "Large wingspan ~2.0m, wingspan: 2.0, chord: 0.25" vs "Short wingspan ~1.2m, wingspan: 1.2, chord: 0.35"). Vary at least: wingspan, wingChord, wingTipChord, wingAirfoil, tail areas, fuselage length. Each strategy should target noticeably different parameter values.
2. Wait for the sub-agents to finish. The sub-agents will automatically create geometry, run aero analysis, and check stability.
3. Once delegateExploration returns, use "compareDesigns" to rank the results.
4. Finally, use "generateReport" to present the winner.

Be methodical. Provide distinct variations (e.g., varying wingspan, tail volume, airfoil) to the 5 sub-agents.`;

export function createChatServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/chat', async (req, res) => {
    const body = req.body;
    let messages;
    if (Array.isArray(body)) {
      messages = body;
    } else if (body && Array.isArray(body.messages)) {
      messages = body.messages;
    } else {
      console.error('Unexpected body format:', JSON.stringify(body).substring(0, 300));
      messages = [];
    }

    const modelMessages = messages.map((m) => {
      if (m.role === 'user') {
        return {
          role: 'user',
          content: Array.isArray(m.parts)
            ? m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('')
            : m.content || '',
        };
      }

      if (m.role === 'assistant' && Array.isArray(m.parts)) {
        const content = [];
        for (const part of m.parts) {
          if (part.type === 'text' && part.text) {
            content.push({ type: 'text', text: part.text });
          } else if (part.type === 'reasoning') {
            content.push({ type: 'reasoning', reasoning: part.reasoning || '' });
          } else if (part.type?.startsWith('tool-') && part.toolCallId) {
            content.push({
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolName: part.type.replace('tool-', ''),
              args: part.input || {},
              ...(part.providerMetadata && { providerMetadata: part.providerMetadata }),
            });
          }
        }
        return {
          role: 'assistant',
          content,
          ...(m.providerOptions && { providerOptions: m.providerOptions })
        };
      }

      if (m.role === 'tool' && Array.isArray(m.parts)) {
        const results = m.parts
          .filter((p) => p.type?.startsWith('tool-') && p.toolCallId)
          .map((p) => ({
            type: 'tool-result',
            toolCallId: p.toolCallId,
            toolName: p.type.replace('tool-', ''),
            result: p.output,
          }));
        return { role: 'tool', content: results };
      }

      return {
        role: m.role,
        content: Array.isArray(m.parts)
          ? m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('')
          : m.content || '',
      };
    });

    try {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          const result = streamText({
            model: google('gemini-3.1-flash-lite-preview'),
            system: SYSTEM_PROMPT,
            messages: modelMessages,
            tools,
            stopWhen: stepCountIs(12),
          });

          writer.merge(result.toUIMessageStream({ sendReasoning: true }));
        },
      });

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
      res.setHeader('x-accel-buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Pipe the stream to the response with proper SSE encoding
      const encoder = new TextEncoder();
      const reader = stream.getReader();
      
      const writeChunk = async () => {
        try {
          const { done, value } = await reader.read();
          
          if (done) {
            // Send final DONE marker
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }

          if (value) {
            // Encode each chunk as SSE format: "data: {json}\n\n"
            const jsonStr = JSON.stringify(value);
            const chunk = encoder.encode(`data: ${jsonStr}\n\n`);
            res.write(Buffer.from(chunk));
          }
          
          // Continue reading next chunk
          await writeChunk();
        } catch (error) {
          console.error('Stream reading error:', error);
          res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
          res.end();
        }
      };

      await writeChunk();
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
