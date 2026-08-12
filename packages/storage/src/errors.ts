export class TaskNotFoundError extends Error {
  readonly code = 'TASK_NOT_FOUND';
  readonly taskId: string;

  constructor(taskId: string) {
    super(`Task with ID "${taskId}" was not found`);
    this.name = 'TaskNotFoundError';
    this.taskId = taskId;
    Object.setPrototypeOf(this, TaskNotFoundError.prototype);
  }
}

export class TaskValidationError extends Error {
  readonly code = 'TASK_VALIDATION_ERROR';
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'TaskValidationError';
    this.details = details;
    Object.setPrototypeOf(this, TaskValidationError.prototype);
  }
}
