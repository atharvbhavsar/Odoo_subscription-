const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface ApiResponse<T = any> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const token = typeof window !== 'undefined' ? localStorage.getItem('brightloop_token') : null;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // sends HTTP-only session cookie
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      // Clear invalid / expired session tokens so subsequent requests don't keep failing with 401
      localStorage.removeItem('brightloop_token');
      localStorage.removeItem('brightloop_user');
    }

    const errorMsg = data?.error?.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg) as Error & { code?: string; details?: any; status: number };
    err.code = data?.error?.code || 'UNKNOWN_ERROR';
    err.details = data?.error?.details;
    err.status = response.status;
    throw err;
  }

  return (data?.data !== undefined ? data.data : data) as T;
}
