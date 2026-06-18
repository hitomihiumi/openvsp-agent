import { tool } from 'ai';
import { z } from 'zod';
import { createGeometry } from './createGeometry.js';
import { runAeroAnalysis } from './runAeroAnalysis.js';
import { checkStability } from './checkStability.js';
import { compareDesigns } from './compareDesigns.js';
import { generateReport } from './generateReport.js';
import { delegateExploration } from "./delegateExploration";

export const tools = {
  delegateExploration: tool({
    description:
        'Spawns multiple AI sub-agents in parallel to explore different design strategies simultaneously. Use this to quickly generate and test up to 5 designs at once.',
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

  createGeometry: tool({
    description:
      'Create drone geometry in OpenVSP with specified parameters. Returns design ID for further analysis.',
    inputSchema: z.object({
      designId: z.string().describe('Unique identifier for this design variant'),
      wingspan: z.number().max(2.0).describe('Wing span in meters (max 2.0)'),
      wingChord: z.number().describe('Wing root chord in meters'),
      wingTipChord: z.number().describe('Wing tip chord in meters'),
      wingAirfoil: z.string().describe('Wing airfoil name (e.g. Eppler387, S1223, Selig9260)'),
      htailArea: z.number().describe('Horizontal tail area in m^2'),
      vtailArea: z.number().describe('Vertical tail area in m^2'),
      htailArm: z.number().describe('Distance from CG to H-tail quarter chord in meters'),
      vtailArm: z.number().describe('Distance from CG to V-tail quarter chord in meters'),
      fuselageLength: z.number().describe('Fuselage length in meters'),
      fuselageWidth: z.number().describe('Fuselage max width/diameter in meters'),
      wingPosition: z.number().describe('Wing leading edge x-position relative to nose'),
      cgPosition: z.number().describe('Center of gravity x-position from nose'),
      description: z.string().describe('Brief description of design intent'),
    }),
    execute: createGeometry,
  }),

  runAeroAnalysis: tool({
    description:
      'Run VSPAERO aerodynamic analysis on a created geometry. Returns CL, CD, L/D, and moment coefficients.',
    inputSchema: z.object({
      designId: z.string().describe('Design ID from createGeometry'),
      alphaStart: z.number().describe('Start angle of attack in degrees'),
      alphaEnd: z.number().describe('End angle of attack in degrees'),
      alphaStep: z.number().describe('Angle of attack step in degrees'),
      machNumber: z.number().default(0.065).describe('Mach number at cruise (22 m/s at sea level)'),
    }),
    execute: runAeroAnalysis,
  }),

  checkStability: tool({
    description:
      'Check longitudinal, directional, and lateral stability of a design. Returns static margins and stability derivatives.',
    inputSchema: z.object({
      designId: z.string().describe('Design ID from createGeometry'),
    }),
    execute: checkStability,
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
