import { getDesignStore } from '../../utils/designStore.js';

export async function compareDesigns(params) {
  console.log('=========================================');
  console.log('TOOL CALLED: compareDesigns!');
  console.log('Параметры от ИИ:', JSON.stringify(params, null, 2));
  console.log('=========================================');

  const { designIds } = params;
  const store = getDesignStore();

  const comparisons = [];

  for (const id of designIds) {
    const design = store[id];
    if (!design) {
      comparisons.push({
        designId: id,
        status: 'missing',
        message: 'Design not found',
      });
      continue;
    }

    const aero = design.aero || {};
    const stability = design.stability || {};
    const p = design.parameters || {};

    const meetsWingspan = (p.wingspan || 999) <= 2.0;
    const meetsStability = stability.overallStable || false;
    const ld = aero.maxLD || 0;
    const cruiseCL = aero.cruiseCL || 0;
    const cruiseSpeed = 22;
    const rho = 1.225;
    const wingArea = p.wingArea || 0;
    const weight = 1.5 * 9.81 + (p.fuselageLength || 1) * 3;
    const lift = 0.5 * rho * cruiseSpeed * cruiseSpeed * wingArea * cruiseCL;
    const meetsLift = lift >= weight;

    const score = (ld * 0.4) + (meetsStability ? 30 : 0) + (meetsWingspan ? 10 : 0) + (meetsLift ? 10 : 0);

    comparisons.push({
      designId: id,
      description: design.description || '',
      parameters: {
        wingspan: p.wingspan,
        wingArea: p.wingArea,
        aspectRatio: p.aspectRatio,
        wingAirfoil: p.wingAirfoil,
        htailArea: p.htailArea,
        vtailArea: p.vtailArea,
        fuselageLength: p.fuselageLength,
      },
      performance: {
        maxLD: ld,
        maxLD_alpha: aero.maxLD_alpha,
        cruiseCL,
        maxCL: aero.maxCL,
      },
      stability: {
        staticMargin: stability.longitudinal?.staticMargin,
        longitudinalStable: stability.longitudinal?.stable ?? false,
        directionalStable: stability.directional?.stable ?? false,
        lateralStable: stability.lateral?.stable ?? false,
        overallStable: stability.overallStable ?? false,
      },
      requirements: {
        wingspanUnder2m: meetsWingspan,
        stable: meetsStability,
        sufficientLift: meetsLift,
        passedAllRequirements: meetsWingspan && meetsStability && meetsLift,
      },
      score: Math.round(score * 100) / 100,
    });
  }

  comparisons.sort((a, b) => b.score - a.score);

  return {
    status: 'completed',
    designs: comparisons,
    ranking: comparisons.map((c, i) => ({
      rank: i + 1,
      designId: c.designId,
      score: c.score,
    })),
    bestDesign: comparisons[0]?.designId || null,
    message: `Compared ${designIds.length} designs. Best: ${comparisons[0]?.designId || 'none'} (score: ${comparisons[0]?.score || 0})`,
  };
}
