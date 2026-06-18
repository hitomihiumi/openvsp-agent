import { getDesignStore } from '../../utils/designStore.js';

export async function generateReport(params) {
  console.log('=========================================');
  console.log('TOOL CALLED: generateReport!');
  console.log('Параметры от ИИ:', JSON.stringify(params, null, 2));
  console.log('=========================================');

  const { selectedDesignId, reasoning, designSummaries } = params;
  const store = getDesignStore();
  const selectedDesign = store[selectedDesignId];

  const report = {
    status: 'completed',
    selectedDesignId,
    reasoning,
    requirements: {
      payload: '1.5 kg camera/sensor package',
      cruiseSpeed: '22 m/s',
      maximizeLD: true,
      wingspanUnder2m: true,
      stabilityRequired: true,
    },
    designsExplored: designSummaries,
    selectedDesignSummary: designSummaries.find((d) => d.designId === selectedDesignId),
    allDesignsSummary: designSummaries.map((d) => ({
      designId: d.designId,
      description: d.description,
      maxLD: d.maxLD,
      wingspan: d.wingspan,
      passedAll: d.passedAllRequirements,
    })),
    message: `Final report generated. Selected design: ${selectedDesignId}. ${reasoning}`,
  };

  store._report = report;
  return report;
}
