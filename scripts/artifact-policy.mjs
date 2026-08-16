export const FORBIDDEN_ARTIFACT_PREFIXES = [
  "tools/",
  "docs/verification/",
  "test/",
  "tests/",
  "fixtures/",
  "results/"
];

export function assertNoManualVerificationContent(entries, artifactName = "artifact") {
  for (const entry of entries) {
    const normalized = String(entry).replaceAll("\\", "/").replace(/^\.\//, "");
    if (FORBIDDEN_ARTIFACT_PREFIXES.some((prefix) => normalized.toLowerCase().startsWith(prefix))) {
      throw new Error(`${artifactName} contains forbidden verification content: ${entry}`);
    }
    if (/(?:^|\/)(?:results?|debug-logs?)(?:\/|$)|\.(?:local\.json|local\.js|debug\.log)$/i.test(normalized)) {
      throw new Error(`${artifactName} contains forbidden local verification output: ${entry}`);
    }
  }
}
