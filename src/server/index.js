import {
  createUIMessageStream,
  streamText,
  stepCountIs,
} from 'ai';
import { google } from '@ai-sdk/google';
import express from 'express';
import cors from 'cors';
import { tools } from './tools/definitions.js';

const SYSTEM_PROMPT = `You are a Supervisor AI aircraft design agent. You operate OpenVSP for conceptual aircraft design.

MISSION INTERPRETATION:
- First, infer the aircraft type and mission constraints from the user's prompt.
- Supported categories include fixed-wing UAV, conventional airplane, helicopter, multirotor, VTOL, or any other aircraft the user describes.
- Pass the inferred aircraft type and all relevant constraints (size limits, payload, speed, endurance, etc.) to each sub-agent via the strategy description.

CRITICAL: To save time, you must delegate the exploration to sub-agents.
1. Use the "delegateExploration" tool to spawn up to 5 sub-agents sequentially. Give each sub-agent a DISTINCT design strategy. Vary geometry parameters appropriate to the aircraft type. Each strategy description MUST include the inferred aircraft type and mission constraints.
2. Wait for the sub-agents to finish.
3. Once delegateExploration returns, use "compareDesigns" to rank the results.
4. Finally, use "generateReport" to present the winner.

DATA INTEGRITY: Only use data returned by the tools (createGeometry, runAeroAnalysis, checkStability, compareDesigns). Do NOT fabricate performance numbers, stability flags, or design parameters. If a sub-agent failed, reflect that honestly in the final report.

CRITICAL AERODYNAMIC BOUNDARIES FOR FIXED-WING STRATEGIES:
- Fuselages MUST be slender. Fuselage width should never exceed 15-20% of its length.
- Tail arms (htailArm, vtailArm) should make physical sense, typically 50-70% of the fuselage length.
- Wing Tip Chord must be equal to or smaller than Wing Root Chord.
- For non-fixed-wing types, relax these rules and use appropriate geometry.

Be methodical. Provide distinct variations that strictly obey the aircraft type and mission constraints.`;

export function createChatServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/chat', async (req, res) => {
    const body = req.body;
    let messages = Array.isArray(body) ? body : (body?.messages || []);

    const modelMessages = messages.map((m) => {
      if (m.role === 'user') return { role: 'user', content: Array.isArray(m.parts) ? m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('') : m.content || '' };

      if (m.role === 'assistant' && Array.isArray(m.parts)) {
        const content = [];
        for (const part of m.parts) {
          if (part.type === 'text' && part.text) content.push({ type: 'text', text: part.text });
          else if (part.type === 'reasoning') content.push({ type: 'reasoning', reasoning: part.reasoning || '' });
          else if (part.type?.startsWith('tool-') && part.toolCallId) {
            content.push({
              type: 'tool-call', toolCallId: part.toolCallId, toolName: part.type.replace('tool-', ''), args: part.input || {},
            });
          }
        }
        return { role: 'assistant', content };
      }

      if (m.role === 'tool' && Array.isArray(m.parts)) {
        return { role: 'tool', content: m.parts.filter((p) => p.type?.startsWith('tool-') && p.toolCallId).map((p) => ({ type: 'tool-result', toolCallId: p.toolCallId, toolName: p.type.replace('tool-', ''), result: p.output })) };
      }

      return { role: m.role, content: m.content || '' };
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

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const encoder = new TextEncoder();
      const reader = stream.getReader();

      const writeChunk = async () => {
        try {
          const { done, value } = await reader.read();
          if (done) { res.write('data: [DONE]\n\n'); res.end(); return; }
          if (value) res.write(Buffer.from(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)));
          await writeChunk();
        } catch (error) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
          res.end();
        }
      };
      await writeChunk();
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  return app;
}