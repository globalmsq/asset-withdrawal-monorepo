let userServiceInstance: any = null;

export async function initializeUserService(): Promise<any> {
  if (!userServiceInstance) {
    const { UserService } = await import('@asset-withdrawal/database');
    userServiceInstance = new UserService();
  }
  return userServiceInstance;
}

export function getUserService(): any {
  if (!userServiceInstance) {
    throw new Error('UserService not initialized. Call initializeUserService first.');
  }
  return userServiceInstance;
}