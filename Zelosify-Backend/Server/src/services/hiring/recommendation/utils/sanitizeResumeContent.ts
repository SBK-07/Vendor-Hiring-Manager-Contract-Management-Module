const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/gi,
  /disregard\s+all\s+rules/gi,
  /system\s*:/gi,
  /developer\s*:/gi,
  /assistant\s*:/gi,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /```[\s\S]*?```/g,
];

export function sanitizeResumeContent(input: string): string {
  if (!input) {
    return "";
  }

  let sanitized = input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, " ");
  }

  return sanitized.slice(0, 12000);
}
