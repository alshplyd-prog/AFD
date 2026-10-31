import { Capacitor } from '@capacitor/core';

/**
 * Centralized API & Server Endpoint Resolver for Web and Android APK
 */

export const CANDIDATE_SERVERS: string[] = [
  'https://ais-dev-5x4c6bq6p4ul7njqnkzon5-947254878994.europe-west2.run.app',
  'https://ais-pre-5x4c6bq6p4ul7njqnkzon5-947254878994.europe-west2.run.app',
  'http://72.62.158.128:3000',
];

const DEFAULT_REMOTE_SERVER = 'https://ais-dev-5x4c6bq6p4ul7njqnkzon5-947254878994.europe-west2.run.app';
const SERVER_URL_STORAGE_KEY = 'alkarrar_backend_server_url';

export function getCustomServerUrl(): string {
  try {
    const custom = localStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (custom && (custom.startsWith('http://') || custom.startsWith('https://'))) {
      return custom.replace(/\/+$/, '');
    }
  } catch (e) {}
  return '';
}

export function setCustomServerUrl(url: string) {
  try {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      localStorage.setItem(SERVER_URL_STORAGE_KEY, url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    }
  } catch (e) {}
}

let activeWorkingServer = '';

export function setActiveWorkingServer(url: string) {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    const clean = url.replace(/\/+$/, '');
    activeWorkingServer = clean;
    try {
      localStorage.setItem(SERVER_URL_STORAGE_KEY, activeWorkingServer);
    } catch (e) {}
  }
}

export function isNativeOrApkEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
      return true;
    }
  } catch (e) {}
  return (
    window.location.protocol === 'file:' ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:' ||
    window.location.protocol === 'content:' ||
    !!(window as any).Capacitor?.isNativePlatform?.() ||
    (window as any).Capacitor?.getPlatform?.() === 'android' ||
    (window.location.hostname === 'localhost' && window.location.port !== '3000' && window.location.port !== '5173') ||
    (window.location.origin && window.location.origin.includes('localhost') && !window.location.port)
  );
}

export function getApiBaseUrl(): string {
  const isNative = isNativeOrApkEnvironment();
  let base = '';
  if (!isNative && typeof window !== 'undefined' && window.location.origin && 
      (window.location.origin.startsWith('http://') || window.location.origin.startsWith('https://')) && 
      !window.location.origin.includes('localhost') && 
      !window.location.origin.includes('127.0.0.1') && 
      !window.location.origin.includes('file://')) {
    base = window.location.origin;
  } else if (activeWorkingServer && !activeWorkingServer.includes('localhost') && !activeWorkingServer.includes('127.0.0.1')) {
    base = activeWorkingServer;
  } else {
    const custom = getCustomServerUrl();
    if (custom && !custom.includes('localhost') && !custom.includes('127.0.0.1')) {
      base = custom;
    } else {
      base = DEFAULT_REMOTE_SERVER;
    }
  }
  return base.replace(/\/+$/, '');
}

export function getPublicShareBaseUrl(): string {
  const custom = getCustomServerUrl();
  if (custom && !custom.includes('localhost') && !custom.includes('127.0.0.1')) {
    return custom.replace(/\/+$/, '');
  }
  if (activeWorkingServer && !activeWorkingServer.includes('localhost') && !activeWorkingServer.includes('127.0.0.1')) {
    return activeWorkingServer.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.origin && 
      (window.location.origin.startsWith('http://') || window.location.origin.startsWith('https://')) && 
      !window.location.origin.includes('localhost') && 
      !window.location.origin.includes('127.0.0.1') && 
      !window.location.origin.includes('capacitor://') && 
      !window.location.origin.includes('file://')) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return DEFAULT_REMOTE_SERVER;
}

export function getFullApiUrl(endpoint: string, baseOverride?: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const base = baseOverride !== undefined ? baseOverride : getApiBaseUrl();
  if (!base) return cleanEndpoint;
  return `${base}${cleanEndpoint}`;
}

import { Network } from '@capacitor/network';

export async function isNetworkConnected(): Promise<boolean> {
  try {
    const status = await Network.getStatus();
    if (typeof status?.connected === 'boolean') {
      return status.connected;
    }
  } catch (e) {}
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

/**
 * Universal fetch that automatically tries candidate servers and local endpoints with fallback
 */
export async function fetchWithFallback(
  endpoint: string,
  options?: RequestInit,
  timeoutMs: number = 6000
): Promise<Response> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const isNative = isNativeOrApkEnvironment();

  const urlsToTry: string[] = [];

  if (isNative) {
    // In native APK / Capacitor environment, NEVER try localhost or relative URLs because there is no API server on the device!
    // Immediately target the remote cloud servers!
    if (activeWorkingServer && !activeWorkingServer.includes('localhost') && !activeWorkingServer.includes('127.0.0.1')) {
      const activeUrl = `${activeWorkingServer}${cleanEndpoint}`;
      if (!urlsToTry.includes(activeUrl)) urlsToTry.push(activeUrl);
    }
    const custom = getCustomServerUrl();
    if (custom && !custom.includes('localhost') && !custom.includes('127.0.0.1')) {
      const customUrl = `${custom}${cleanEndpoint}`;
      if (!urlsToTry.includes(customUrl)) urlsToTry.push(customUrl);
    }
    for (const server of CANDIDATE_SERVERS) {
      const candidateUrl = `${server}${cleanEndpoint}`;
      if (!urlsToTry.includes(candidateUrl)) {
        urlsToTry.push(candidateUrl);
      }
    }
    if (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http')) {
      const originUrl = `${window.location.origin}${cleanEndpoint}`;
      if (!urlsToTry.includes(originUrl)) urlsToTry.push(originUrl);
    }
    if (!urlsToTry.includes(cleanEndpoint)) {
      urlsToTry.push(cleanEndpoint);
    }
  } else {
    // 1. If in browser / web mode, try relative and origin URLs first
    if (typeof window !== 'undefined' && window.location.origin && (window.location.origin.startsWith('http://') || window.location.origin.startsWith('https://'))) {
      if (!urlsToTry.includes(cleanEndpoint)) {
        urlsToTry.push(cleanEndpoint);
      }
      const originUrl = `${window.location.origin}${cleanEndpoint}`;
      if (!urlsToTry.includes(originUrl)) {
        urlsToTry.push(originUrl);
      }
    } else {
      if (!urlsToTry.includes(cleanEndpoint)) {
        urlsToTry.push(cleanEndpoint);
      }
    }

    // 2. Add configured URL and candidate servers
    if (activeWorkingServer) {
      const activeUrl = `${activeWorkingServer}${cleanEndpoint}`;
      if (!urlsToTry.includes(activeUrl)) urlsToTry.push(activeUrl);
    }
    const primaryUrl = getFullApiUrl(cleanEndpoint);
    if (!urlsToTry.includes(primaryUrl)) {
      urlsToTry.push(primaryUrl);
    }
    for (const server of CANDIDATE_SERVERS) {
      const candidateUrl = `${server}${cleanEndpoint}`;
      if (!urlsToTry.includes(candidateUrl)) {
        urlsToTry.push(candidateUrl);
      }
    }
  }

  let lastError: any = null;

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const perUrlTimeout = timeoutMs || (isNative ? 7000 : 5000);
      const timer = setTimeout(() => controller.abort(), perUrlTimeout);
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          ...(options?.headers || {}),
        },
      });
      clearTimeout(timer);

      if (res.ok) {
        // Verify that it is not an HTML fallback page (e.g. index.html) for an API route
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          // If the endpoint is an API route and got HTML back, this server did not match the API route
          continue;
        }

        if (isNative && url.startsWith('http')) {
          try {
            const urlObj = new URL(url);
            setActiveWorkingServer(urlObj.origin);
          } catch (e) {}
        }
        return res;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Network fetch failed for ${endpoint}`);
}

export async function universalApiFetch(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  return fetchWithFallback(endpoint, options, 8000);
}

export async function checkServerHealth(url?: string): Promise<{ ok: boolean; status?: string; database?: string; latencyMs: number; error?: string }> {
  const start = Date.now();
  const baseUrl = url ? url.trim().replace(/\/+$/, '') : getApiBaseUrl();
  const targetUrl = baseUrl ? `${baseUrl}/api/health` : '/api/health';
  
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: true,
        status: data.status || 'ok',
        database: data.database || 'postgresql',
        latencyMs,
      };
    } else {
      return {
        ok: false,
        latencyMs,
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      ok: false,
      latencyMs,
      error: err.name === 'AbortError' ? 'انتهت مهلة الاتصال بالخادم (Timeout)' : (err.message || 'تعذر الاتصال بالخادم'),
    };
  }
}

