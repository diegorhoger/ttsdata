// Worker scoring pipeline
// For now, the API triggers scoring. Worker focuses on ingestion.
export async function runScoringPipeline(db: any, marketplace: string = 'BR'): Promise<number> {
  console.log(`Scoring pipeline for ${marketplace} — delegated to API`);
  return 0;
}
