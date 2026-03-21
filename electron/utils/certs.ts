import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const CERT_DAYS = 825; // macOS max for trusted certs

function toCertFileSafeHost(host: string): string {
  const trimmed = host.trim().toLowerCase() || 'localhost';
  return trimmed.replace(/[^a-z0-9.-]+/g, '-');
}

/**
 * Ensure a self-signed TLS certificate exists for the configured callback host.
 * Generates one via openssl if missing. Returns PEM strings.
 */
export async function ensureCerts(certsDir: string, host = 'localhost'): Promise<{ key: string; cert: string }> {
  const safeHost = toCertFileSafeHost(host);
  const keyFile = `${safeHost}.key`;
  const certFile = `${safeHost}.cert`;
  const keyPath = join(certsDir, keyFile);
  const certPath = join(certsDir, certFile);

  if (existsSync(keyPath) && existsSync(certPath)) {
    return {
      key: readFileSync(keyPath, 'utf-8'),
      cert: readFileSync(certPath, 'utf-8'),
    };
  }

  console.info(`[Certs] Generating self-signed certificate for ${host}...`);

  await execFileAsync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048',
    '-keyout', keyPath,
    '-out', certPath,
    '-days', String(CERT_DAYS),
    '-nodes',
    '-subj', `/CN=${host}`,
    '-addext', `subjectAltName=DNS:${host}`,
  ]);

  console.info('[Certs] Certificate generated at', certsDir);

  return {
    key: readFileSync(keyPath, 'utf-8'),
    cert: readFileSync(certPath, 'utf-8'),
  };
}
