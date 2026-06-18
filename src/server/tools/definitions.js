import { tool } from 'ai';
import { z } from 'zod';
import { compareDesigns } from './compareDesigns.js';
import { generateReport } from './generateReport.js';
import { delegateExploration } from "./delegateExploration";

export const tools = {
  delegateExploration: tool({
    description:
        'Spawns multiple AI sub-agents sequentially to explore different design strategies. Use this to generate and test up to 5 designs. The strategy description must include the aircraft type and mission constraints inferred from the user prompt.',
    inputSchema: z.object({
      strategies: z.array(
          z.object({
            designId: z.string().describe('Unique ID for this variation (e.g., design-1)'),
            description: z.string().describe('Instructions for the sub-agent on what parameters to focus on (e.g., "Maximize wingspan up to 2m, use high camber airfoil")'),
          })
      ).max(5).describe('List of design strategies to explore in parallel. Max 5.'),
    }),
    execute: delegateExploration,
  }),

  compareDesigns: tool({
    description:
      'Compare multiple design results side by side and rank them by performance metrics.',
    inputSchema: z.object({
      designIds: z.array(z.string()).describe('List of design IDs to compare'),
    }),
    execute: compareDesigns,
  }),

  generateReport: tool({
    description:
      'Generate the final comparison report with the selected design and reasoning.',
    inputSchema: z.object({
      selectedDesignId: z.string().describe('The selected best design ID'),
      reasoning: z.string().describe('Detailed reasoning for why this design was selected'),
      designSummaries: z.array(
        z.object({
          designId: z.string(),
          description: z.string(),
          maxLD: z.number(),
          cruiseCL: z.number(),
          longitudinalStable: z.boolean(),
          directionalStable: z.boolean(),
          lateralStable: z.boolean(),
          wingspan: z.number(),
          passedAllRequirements: z.boolean(),
        })
      ),
    }),
    execute: generateReport,
  }),
};
