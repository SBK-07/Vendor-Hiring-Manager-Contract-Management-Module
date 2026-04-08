export function logStructured(event: string, payload: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "hiring-recommendation-agent",
      event,
      ...payload,
    })
  );
}
