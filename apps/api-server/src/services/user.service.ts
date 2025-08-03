import type { UserService } from '@asset-withdrawal/database';

let userServiceInstance: UserService | null = null;

export async function initializeUserService(): Promise<UserService> {
  if (!userServiceInstance) {
    const { UserService } = await import('@asset-withdrawal/database');
    userServiceInstance = new UserService();
  }
  return userServiceInstance;
}

export function getUserService(): UserService {
  if (!userServiceInstance) {
    throw new Error('UserService not initialized. Call initializeUserService first.');
  }
  return userServiceInstance;
}