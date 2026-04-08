const SKILL_SYNONYMS: Record<string, string> = {
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  reactjs: "react",
  react: "react",
  nodejs: "node.js",
  node: "node.js",
  postgres: "postgresql",
  postgresql: "postgresql",
  aws: "aws",
  s3: "aws",
  docker: "docker",
  kubernetes: "kubernetes",
  springboot: "spring boot",
  spring: "spring boot",
};

export function skillNormalizationTool(input: { skills: string[] }): { normalizedSkills: string[] } {
  const normalized = (input.skills || [])
    .map((item) => item.toLowerCase().trim())
    .filter(Boolean)
    .map((item) => SKILL_SYNONYMS[item] || item);

  return {
    normalizedSkills: Array.from(new Set(normalized)),
  };
}
