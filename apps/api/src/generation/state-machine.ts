import type { GenerationTaskStatus } from "@dreamina/shared";

const ALLOWED: Readonly<Record<GenerationTaskStatus, readonly GenerationTaskStatus[]>> = {
  queued: ["running", "succeeded", "failed"],
  running: ["succeeded", "failed"],
  succeeded: [],
  failed: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: GenerationTaskStatus, to: GenerationTaskStatus) {
    super(`Invalid generation task transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: GenerationTaskStatus, to: GenerationTaskStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export function nextStatus(from: GenerationTaskStatus, to: GenerationTaskStatus): GenerationTaskStatus {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return to;
}
