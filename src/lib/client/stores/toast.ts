import { writable } from 'svelte/store';

export type Toast = {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
};

export const toasts = writable<Toast[]>([]);

export function addToast(message: string, type: Toast['type'] = 'success', duration = 3000) {
	// Ephemeral browser-only key: avoid pulling an ID-generator package into the global client chunk.
	const id = crypto.randomUUID();
	toasts.update((t) => [...t, { id, message, type }]);
	setTimeout(() => {
		toasts.update((t) => t.filter((toast) => toast.id !== id));
	}, duration);
}
