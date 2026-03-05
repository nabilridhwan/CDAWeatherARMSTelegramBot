import { version } from '../../package.json';

export function generateVersionInfoMessage(): string {
  return `Version: ${version}`;
}
