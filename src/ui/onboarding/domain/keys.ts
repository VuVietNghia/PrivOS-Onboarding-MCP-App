// src/ui/onboarding/domain/keys.ts
import { RUN_KEY_PREFIX, TEMPLATE_KEY_PREFIX } from './fields';

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function templateKey(position: string): string {
  return `${TEMPLATE_KEY_PREFIX}${slugify(position)}`;
}

export function runKey(userId: string, isoStartDate: string): string {
  return `${RUN_KEY_PREFIX}${userId}-${isoStartDate.replace(/-/g, '')}`;
}
