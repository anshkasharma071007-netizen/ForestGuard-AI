const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error('The Forest Guard service is not connected yet.');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });

  if (!response.ok) {
    throw new Error('The Forest Guard service could not complete this request.');
  }

  return response.json() as Promise<T>;
}
