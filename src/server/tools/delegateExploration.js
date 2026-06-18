import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { createGeometry } from './createGeometry.js';
import { runAeroAnalysis } from './runAeroAnalysis.js';
import { checkStability } from './checkStability.js';
import { getDesignStore } from '../../utils/designStore.js';
import { z } from 'zod';

const subAgentTools = {
    createGeometry: tool({
        description: 'Create drone geometry in OpenVSP. Returns design ID.',
        inputSchema: z.object({
            designId: z.string().describe('Unique identifier for this design variant'),
            wingspan: z.number().max(2.0).describe('Wing span in meters (max 2.0)'),
            wingChord: z.number().min(0.05).describe('Wing root chord in meters (0.05-0.5)'),
            wingTipChord: z.number().min(0.03).describe('Wing tip chord in meters (0.03-0.4)'),
            wingAirfoil: z.string().describe('Wing airfoil name (e.g. Eppler387, S1223, Selig9260)'),
            htailArea: z.number().min(0.02).describe('Horizontal tail area in m^2 (0.02-0.3)'),
            vtailArea: z.number().min(0.01).describe('Vertical tail area in m^2 (0.01-0.15)'),
            htailArm: z.number().min(0.2).describe('Distance from CG to H-tail quarter chord in meters (0.2-1.0)'),
            vtailArm: z.number().min(0.2).describe('Distance from CG to V-tail quarter chord in meters (0.2-1.0)'),
            fuselageLength: z.number().min(0.3).describe('Fuselage length in meters (0.3-2.0)'),
            fuselageWidth: z.number().min(0.03).describe('Fuselage max width/diameter in meters (0.03-0.3)'),
            wingPosition: z.number().min(0.05).describe('Wing leading edge x-position relative to nose as fraction of fuselage (0.05-0.6)'),
            cgPosition: z.number().min(0.1).describe('Center of gravity x-position from nose as fraction of fuselage (0.1-0.7)'),
            description: z.string().describe('Brief description of design intent'),
        }),
        execute: createGeometry,
    }),
    runAeroAnalysis: tool({
        description: 'Run VSPAERO aerodynamic analysis. Returns CL, CD, L/D coefficients.',
        inputSchema: z.object({
            designId: z.string().describe('Design ID from createGeometry'),
            alphaStart: z.number().describe('Start angle of attack in degrees (-5 to -2)'),
            alphaEnd: z.number().describe('End angle of attack in degrees (10 to 15)'),
            alphaStep: z.number().describe('Angle of attack step in degrees (0.5 to 2.0)'),
            machNumber: z.number().default(0.065).describe('Mach number at cruise (22 m/s at sea level)'),
        }),
        execute: runAeroAnalysis,
    }),
    checkStability: tool({
        description: 'Check longitudinal, directional, and lateral stability of a design.',
        inputSchema: z.object({ designId: z.string().describe('Design ID from createGeometry') }),
        execute: checkStability,
    }),
};

export async function delegateExploration(params) {
    const { strategies } = params;

    // Изменено сообщение в логе, чтобы понимать, что запуск теперь последовательный
    console.log(`[Supervisor] Launching ${strategies.length} sub-agents sequentially...`);
    console.log(`[Supervisor] Strategies:`, JSON.stringify(strategies, null, 2));

    const results = [];

    // ИСПРАВЛЕНИЕ: Используем цикл for...of вместо Promise.all
    for (const strategy of strategies) {
        const subAgentSystemPrompt = `
      You are an independent OpenVSP Sub-agent. Your task is to implement, simulate, 
      and check the stability of a specific drone design strategy.

      Your specific design strategy is:
      "${strategy.description}"
      Design ID to use: ${strategy.designId}

      CRITICAL: Generate DISTINCT parameters that match your specific strategy.
      Different strategies MUST use different wingspan, wingChord, airfoil, tail areas, etc.
      For example, a "high speed" strategy should use small wingspan + small wing area,
      while a "long endurance" strategy should use large wingspan + high aspect ratio.

      You must perform exactly three steps:
      1. Call createGeometry using parameters that are UNIQUE to your strategy.
      2. Call runAeroAnalysis on the created geometry.
      3. Call checkStability on the created geometry.

      Conclude by returning a brief text summary of whether the design was successful.
    `;

        try {
            const result = await generateText({
                model: google('gemini-3.1-flash-lite-preview'),
                system: subAgentSystemPrompt,
                prompt: `Start executing the strategy for ${strategy.designId}.`,
                tools: subAgentTools,
                stopWhen: ({ steps }) => steps.length >= 8,
                onStepFinish: (step) => {
                    console.log(`[Sub-agent ${strategy.designId}] === Step ${step.stepNumber} ===`);
                    console.log(`[Sub-agent ${strategy.designId}] finishReason:`, step.finishReason);
                    console.log(`[Sub-agent ${strategy.designId}] text length:`, step.text?.length || 0);
                    const calls = step.toolCalls.map(tc => ({ toolName: tc.toolName, input: tc.input }));
                    console.log(`[Sub-agent ${strategy.designId}] toolCalls:`, JSON.stringify(calls));
                    const results = step.toolResults.map(tr => ({ toolName: tr.toolName, status: tr.result?.status || 'ok' }));
                    console.log(`[Sub-agent ${strategy.designId}] toolResults:`, JSON.stringify(results));
                },
            });

            console.log(`[Sub-agent ${strategy.designId}] generateText finished. steps:`, result.steps?.length || 0, 'finishReason:', result.finishReason, 'text length:', result.text?.length || 0);

            const summaryText = result.text || (() => {
                const steps = result.steps || [];
                const allCalls = steps.flatMap(s => s.toolCalls || []);
                const allResults = steps.flatMap(s => s.toolResults || []);
                const completed = allCalls.map(tc => tc.toolName).join(', ');
                return `Design ${strategy.designId} completed. Tools used: ${completed || 'none'}. Steps: ${steps.length}. Finish reason: ${result.finishReason}`;
            })();

            console.log(`[Sub-agent ${strategy.designId}] Final:`, summaryText);

            // Добавляем результат в массив
            results.push({
                designId: strategy.designId,
                status: 'completed',
                agentSummary: summaryText
            });
        } catch (err) {
            console.error(`[Sub-agent ${strategy.designId}] Error:`, err);
            results.push({ designId: strategy.designId, status: 'failed', error: err.message });
        }
    }

    // Attach stored design data to each result so the React store can pick it up
    const store = getDesignStore();
    const designsWithData = results.map(r => {
        const stored = store[r.designId];
        if (!stored) return r;
        return {
            ...r,
            parameters: stored.parameters || null,
            aero: stored.aero || null,
            stability: stored.stability || null,
        };
    });

    return {
        message: `Sequential exploration complete. ${results.filter(r => r.status === 'completed').length} sub-agents finished successfully.`,
        agentReports: designsWithData
    };
}