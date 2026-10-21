/**
 * Runs async work and always invokes cleanup, without using try/finally.
 * React Compiler (SDK 57) cannot lower TryStatement finalizers.
 */
export async function runWithCleanup<T>(work: () => Promise<T>, cleanup: () => void): Promise<T> {
  try {
    const result = await work();
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}
