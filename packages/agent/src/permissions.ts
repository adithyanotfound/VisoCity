import crypto from 'node:crypto';
import type { StorageRepository } from '@visoagent/storage';

export interface PermitRequestOptions {
  permitId?: string;
  sessionId: string;
  cityId: string;
  toolName: string;
  description: string;
  targetPath?: string;
  timeoutMs?: number;
}

export interface PendingPermit {
  permitId: string;
  sessionId: string;
  cityId: string;
  toolName: string;
  targetPath?: string;
  description: string;
  createdAt: number;
  resolve: (decision: 'allow' | 'deny') => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
}

export class PermissionGatekeeper {
  private pendingPermits = new Map<string, PendingPermit>();
  private gatedTools: Set<string>;
  private storage?: StorageRepository;

  constructor(options: { gatedTools?: string[]; storage?: StorageRepository } = {}) {
    this.gatedTools = new Set(
      options.gatedTools ?? [
        'Write',
        'Edit',
        'Bash',
        'NotebookEdit',
        'git_push',
        'delete_file',
        'execute_command',
      ],
    );
    this.storage = options.storage;
  }

  public isToolGated(toolName: string): boolean {
    return this.gatedTools.has(toolName);
  }

  public addGatedTool(toolName: string): void {
    this.gatedTools.add(toolName);
  }

  public removeGatedTool(toolName: string): void {
    this.gatedTools.delete(toolName);
  }

  public async requestPermit(options: PermitRequestOptions): Promise<'allow' | 'deny'> {
    const permitId = options.permitId ?? `permit_${crypto.randomUUID()}`;

    return new Promise<'allow' | 'deny'>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      if (options.timeoutMs && options.timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pendingPermits.delete(permitId);
          if (this.storage) {
            this.storage.updatePermit(permitId, {
              status: 'denied',
              resolvedAt: Date.now(),
            });
          }
          resolve('deny');
        }, options.timeoutMs);
      }

      const pending: PendingPermit = {
        permitId,
        sessionId: options.sessionId,
        cityId: options.cityId,
        toolName: options.toolName,
        targetPath: options.targetPath,
        description: options.description,
        createdAt: Date.now(),
        resolve,
        reject,
        timer,
      };

      this.pendingPermits.set(permitId, pending);

      if (this.storage) {
        this.storage.savePermit({
          permitId,
          cityId: options.cityId,
          sessionId: options.sessionId,
          toolName: options.toolName,
          targetPath: options.targetPath,
          description: options.description,
          status: 'pending',
          createdAt: pending.createdAt,
        });
      }
    });
  }

  public resolvePermit(permitId: string, decision: 'allow' | 'deny', _reason?: string): boolean {
    const pending = this.pendingPermits.get(permitId);
    if (!pending) {
      return false;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    this.pendingPermits.delete(permitId);

    if (this.storage) {
      this.storage.updatePermit(permitId, {
        status: decision === 'allow' ? 'allowed' : 'denied',
        resolvedAt: Date.now(),
      });
    }

    pending.resolve(decision);
    return true;
  }

  public clearSessionPermits(sessionId: string): void {
    for (const [permitId, pending] of this.pendingPermits.entries()) {
      if (pending.sessionId === sessionId) {
        if (pending.timer) {
          clearTimeout(pending.timer);
        }
        this.pendingPermits.delete(permitId);
        if (this.storage) {
          this.storage.updatePermit(permitId, {
            status: 'denied',
            resolvedAt: Date.now(),
          });
        }
        pending.resolve('deny');
      }
    }
  }

  public getPendingPermits(cityId?: string, sessionId?: string): PendingPermit[] {
    const permits: PendingPermit[] = [];
    for (const permit of this.pendingPermits.values()) {
      if (cityId && permit.cityId !== cityId) continue;
      if (sessionId && permit.sessionId !== sessionId) continue;
      permits.push(permit);
    }
    return permits;
  }
}
