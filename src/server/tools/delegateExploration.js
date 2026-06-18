import { generateText, generateObject, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { createGeometry } from './createGeometry.js';
import { runAeroAnalysis } from './runAeroAnalysis.js';
import { checkStability } from './checkStability.js';
import { getDesignStore } from '../../utils/designStore.js';
import { getRunsBasePath } from '../../utils/paths.js';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

const geometryParamsSchema = z.object({
    designId: z.string().describe('Unique identifier for this design variant'),
    aircraftType: z.string().optional().describe(
        'Aircraft category inferred by the supervisor (e.g., fixed-wing UAV, helicopter, multirotor).'
    ),
    wingspan: z.number().min(0.1).max(10.0).describe(
        'Wing span in meters. Use a value appropriate for the aircraft type and mission.'
    ),
    wingChord: z.number().min(0.05).max(2.00).describe(
        'Wing root chord in meters. For high AR, use smaller chord.'
    ),
    wingTipChord: z.number().min(0.02).max(2.00).describe(
        'Wing tip chord. MUST be <= wingChord. Taper ratio 0.4–0.7 is typical.'
    ),
    wingAirfoil: z.string().describe(
        'Wing airfoil name. Choose an airfoil suitable for the aircraft type and mission.'
    ),
    htailArea: z.number().min(0.01).max(2.00).describe(
        'Horizontal tail area in m². For fixed-wing aircraft typical tail volume coeff 0.35–0.50. '
        + 'Skip or set 0 for aircraft types without a horizontal tail (e.g., multirotor).'
    ),
    vtailArea: z.number().min(0.01).max(2.00).describe(
        'Vertical tail area in m². For fixed-wing aircraft typical tail volume coeff 0.02–0.05. '
        + 'Skip or set 0 for aircraft types without a vertical tail.'
    ),
    htailArm: z.number().min(0.10).max(5.00).describe(
        'Distance from CG to H-tail aerodynamic center in meters. '
        + 'For fixed-wing aircraft: MUST satisfy cgPosition*fuselageLength + htailArm <= fuselageLength.'
    ),
    vtailArm: z.number().min(0.10).max(5.00).describe(
        'Distance from CG to V-tail aerodynamic center in meters. '
        + 'Same constraint as htailArm. Usually equal to htailArm.'
    ),
    fuselageLength: z.number().min(0.20).max(10.00).describe(
        'Fuselage length in meters. Choose a value appropriate for the aircraft type.'
    ),
    fuselageWidth: z.number().min(0.02).max(2.00).describe(
        'Fuselage max width/diameter in meters. For fixed-wing aircraft keep it slender (8–20% of length).'
    ),
    wingPosition: z.number().min(0.05).max(0.80).describe(
        'Wing LE x-position as fraction of fuselage length from nose. Must be < cgPosition.'
    ),
    cgPosition: z.number().min(0.10).max(0.80).describe(
        'CG x-position as fraction of fuselage length from nose. '
        + 'For fixed-wing aircraft wing aerodynamic center should be ~5–15% MAC behind CG for stability.'
    ),
    description: z.string().describe('Brief description of this design strategy.'),
});

function buildSubAgentTools(runDir) {
    return {
        createGeometry: tool({
            description: 'Create aircraft geometry in OpenVSP. Returns design ID.',
            inputSchema: geometryParamsSchema,
            execute: async (agentParams) => {
                const result = await createGeometry({ ...agentParams, runDir });
                if (result?.status === 'error') {
                    throw new Error(result.message || 'createGeometry failed');
                }
                return result;
            },
        }),

        runAeroAnalysis: tool({
            description: 'Run VSPAERO aerodynamic analysis on the created geometry.',
            inputSchema: z.object({
                designId: z.string().describe('Design ID from createGeometry'),
                alphaStart: z.number().describe('Start AoA in degrees. Use -2 for fixed-wing.'),
                alphaEnd:   z.number().describe('End AoA in degrees. Use 12 for fixed-wing.'),
                alphaStep:  z.number().describe('AoA step in degrees. Use 1.'),
                machNumber: z.number().default(0.065).describe('Mach number. Default 0.065 corresponds to ~22 m/s at sea level.'),
            }),
            execute: async (agentParams) => {
                const result = await runAeroAnalysis({ ...agentParams, runDir });
                if (result?.status === 'error') {
                    throw new Error(result.message || 'runAeroAnalysis failed');
                }
                return result;
            },
        }),

        checkStability: tool({
            description: 'Check longitudinal, directional, and lateral stability via VSPAERO.',
            inputSchema: z.object({
                designId: z.string().describe('Design ID from createGeometry'),
            }),
            execute: async (agentParams) => {
                const result = await checkStability({ ...agentParams, runDir });
                if (result?.status === 'error') {
                    throw new Error(result.message || 'checkStability failed');
                }
                return result;
            },
        }),
    };
}

function buildSubAgentSystemPrompt(strategy) {
    return `
You are an expert aircraft designer and OpenVSP sub-agent. Your task is to design, simulate,
and evaluate ONE specific aircraft design variant.

Your strategy (provided by the supervisor):
"${strategy.description}"
Design ID: ${strategy.designId}

The supervisor has already inferred the aircraft type and mission constraints from the user's request.
You MUST respect the aircraft type and any numeric limits described in the strategy above.
If the strategy says the aircraft is a multirotor, helicopter, or other non-fixed-wing type, adapt the
geometry parameters accordingly (e.g., skip tail surfaces that do not exist for that type).

═════ CRITICAL GEOMETRY RULES (MUST NOT BE VIOLATED) ═════

1. PHYSICALLY REALISTIC FUSELAGE
   For fixed-wing aircraft, fuselageWidth should be 8–20 % of fuselageLength. No flying saucers.
   For other aircraft types, use proportions appropriate to that type.

2. TAIL ARMS WITHIN FUSELAGE (fixed-wing only)
   CG is at cgPosition × fuselageLength from the nose.
   htailArm must satisfy: cgPosition × fuselageLength + htailArm ≤ fuselageLength × 0.95

3. TIP CHORD ≤ ROOT CHORD (fixed-wing wings)
   wingTipChord must always be smaller than or equal to wingChord.

4. WING POSITION AHEAD OF CG (fixed-wing)
   wingPosition < cgPosition (leading edge upstream of centre of gravity).

═════ AERODYNAMIC SIZING GUIDANCE (fixed-wing) ═════
• Wing area ~ 0.25–0.45 m² for a 1.5 kg payload at 22 m/s (CL ~ 0.4–0.7).
• Horizontal tail volume coeff ~ 0.35–0.50 (htailVol = htailArea × htailArm / (wingArea × MAC)).
• Vertical tail volume coeff ~ 0.03–0.06.

Return a concise description of your strategy and the chosen parameters. Do NOT make up performance numbers.
`;
}

export async function delegateExploration(params) {
    const { strategies } = params;
    const runsBase = getRunsBasePath();

    console.log(`[Supervisor] Launching ${strategies.length} sub-agents sequentially...`);

    const results = [];

    for (const strategy of strategies) {
        const runDir = path.join(runsBase, `run_${strategy.designId}`);
        fs.mkdirSync(runDir, { recursive: true });
        const subAgentTools = buildSubAgentTools(runDir);
        const systemPrompt = buildSubAgentSystemPrompt(strategy);

        let geometryResult = null;
        let aeroResult = null;
        let stabilityResult = null;
        let summaryText = '';
        let failureReason = null;

        try {
            // Step 1: Ask the sub-agent to choose geometry parameters.
            console.log(`[Sub-agent ${strategy.designId}] Choosing geometry parameters...`);
            const paramsResult = await generateObject({
                model: google('gemini-3.1-flash-lite-preview'),
                system: systemPrompt,
                prompt: `Generate geometry parameters for design "${strategy.designId}" that match the strategy above. Return a valid JSON object with all required fields.`,
                schema: geometryParamsSchema,
                maxRetries: 2,
            });

            const geometryParams = { ...paramsResult.object, designId: strategy.designId };
            console.log(`[Sub-agent ${strategy.designId}] Params:`, JSON.stringify(geometryParams, null, 2));

            // Step 2: Create geometry (manual call — guaranteed to execute).
            console.log(`[Sub-agent ${strategy.designId}] Creating geometry...`);
            geometryResult = await subAgentTools.createGeometry.execute(geometryParams);
            console.log(`[Sub-agent ${strategy.designId}] Geometry status:`, geometryResult.status);

            // Step 3: Run aerodynamic analysis (manual call).
            console.log(`[Sub-agent ${strategy.designId}] Running aero analysis...`);
            aeroResult = await subAgentTools.runAeroAnalysis.execute({
                designId: strategy.designId,
                alphaStart: -2,
                alphaEnd: 12,
                alphaStep: 1,
                machNumber: 0.065,
            });
            console.log(`[Sub-agent ${strategy.designId}] Aero status:`, aeroResult.status, 'maxLD:', aeroResult.maxLD);

            // Step 4: Check stability (manual call).
            console.log(`[Sub-agent ${strategy.designId}] Checking stability...`);
            stabilityResult = await subAgentTools.checkStability.execute({ designId: strategy.designId });
            console.log(`[Sub-agent ${strategy.designId}] Stability status:`, stabilityResult.status, 'overallStable:', stabilityResult.overallStable);

            // Step 5: Generate final summary from the real results.
            const summaryResult = await generateText({
                model: google('gemini-3.1-flash-lite-preview'),
                system: systemPrompt,
                prompt: `
Design ${strategy.designId} has been created and analyzed. Write a 3-sentence summary using ONLY the real data below.
Do not invent numbers.

Geometry: ${JSON.stringify(geometryResult.parameters || {}, null, 2)}
Aero: maxLD=${aeroResult.maxLD}, cruiseCL=${aeroResult.cruiseCL}, maxCL=${aeroResult.maxCL}
Stability: overallStable=${stabilityResult.overallStable}, staticMargin=${stabilityResult.longitudinal?.staticMargin}
`,
                maxSteps: 2,
            });
            summaryText = summaryResult.text || `Design ${strategy.designId} completed.`;
            console.log(`[Sub-agent ${strategy.designId}] Summary:`, summaryText);
        } catch (err) {
            failureReason = err.message || String(err);
            console.error(`[Sub-agent ${strategy.designId}] Error:`, failureReason);
        }

        results.push({
            designId:     strategy.designId,
            status:       failureReason ? 'failed' : 'completed',
            agentSummary: summaryText || failureReason,
            error:        failureReason,
        });
    }

    const store = getDesignStore();
    const designsWithData = results.map(r => {
        const stored = store[r.designId];
        if (!stored) return { ...r, status: 'failed', error: r.error || 'No data returned from sub-agent' };

        const missing = [];
        if (!stored.parameters) missing.push('parameters');
        if (!stored.aero) missing.push('aero');
        if (!stored.stability) missing.push('stability');

        if (missing.length > 0) {
            return {
                ...r,
                status: 'failed',
                error:  r.error || `Incomplete sub-agent execution. Missing: ${missing.join(', ')}`,
                parameters: stored.parameters || null,
                aero:       stored.aero       || null,
                stability:  stored.stability  || null,
            };
        }

        return {
            ...r,
            parameters: stored.parameters || null,
            aero:       stored.aero       || null,
            stability:  stored.stability  || null,
        };
    });

    const succeeded = designsWithData.filter(r => r.status === 'completed').length;
    return {
        message: `Sequential exploration complete. ${succeeded}/${designsWithData.length} sub-agents succeeded.`,
        agentReports: designsWithData,
    };
}
