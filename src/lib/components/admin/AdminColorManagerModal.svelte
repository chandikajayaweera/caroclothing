<script lang="ts">
	import { X, Trash2, Plus } from 'lucide-svelte';
	import { deserialize } from '$app/forms';
	import { Dialog } from 'bits-ui';
	import { fade, scale } from 'svelte/transition';
	import AdminHexInput from './AdminHexInput.svelte';

	let {
		open = $bindable(false),
		colors = $bindable([]),
		onClose
	}: {
		open: boolean;
		colors: Array<{ id: string; name: string; hex: string }>;
		onClose?: () => void;
	} = $props();

	let name = $state('');
	let hex = $state('#000000');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	function formatColorName(val: string): string {
		return val
			.split(' ')
			.map((word) => {
				if (!word) return '';
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			})
			.join(' ');
	}

	function handleClose() {
		open = false;
		if (onClose) onClose();
	}

	async function handleCreate(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) {
			error = 'Color name is required';
			return;
		}
		if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
			error = 'Invalid hex color';
			return;
		}

		submitting = true;
		error = null;

		try {
			const formData = new FormData();
			formData.append('name', name.trim());
			formData.append('hex', hex);

			const response = await fetch('?/createColor', {
				method: 'POST',
				body: formData
			});

			const result = deserialize(await response.text());

			if (result.type === 'success') {
				const actionData = result.data as
					| { color?: { id: string; name: string; hex: string } }
					| undefined;
				const newColor = actionData?.color;

				if (newColor && newColor.id) {
					colors = [...colors, newColor].sort((a, b) => a.name.localeCompare(b.name));
					name = '';
					hex = '#000000';
				} else {
					error = 'Color created successfully. Please refresh or try selecting it.';
				}
			} else if (result.type === 'failure') {
				const actionData = result.data as { message?: string } | undefined;
				error = actionData?.message || 'Failed to create color';
			} else {
				error = 'An unexpected error occurred';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			submitting = false;
		}
	}

	let deleteConfirmId = $state<string | null>(null);

	async function executeDelete(colorId: string) {
		submitting = true;
		error = null;
		deleteConfirmId = null;

		try {
			const formData = new FormData();
			formData.append('colorId', colorId);

			const response = await fetch('?/deleteColor', {
				method: 'POST',
				body: formData
			});

			const result = deserialize(await response.text());

			if (result.type === 'success') {
				colors = colors.filter((c) => c.id !== colorId);
			} else if (result.type === 'failure') {
				const actionData = result.data as { message?: string } | undefined;
				error = actionData?.message || 'Failed to delete color';
			} else {
				error = 'An unexpected error occurred';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	{#if open}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-[100] bg-void/85 backdrop-blur-xs"
					></div>
				{/snippet}
			</Dialog.Overlay>
			<div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
				<Dialog.Content>
					{#snippet child({ props })}
						<div
							{...props}
							transition:scale={{ duration: 200, start: 0.95 }}
							class="relative w-full max-w-md border border-ash/15 bg-charcoal p-6 shadow-2xl outline-none"
						>
							<Dialog.Title class="sr-only">Manage Colors</Dialog.Title>
							<Dialog.Description class="sr-only">
								Add new colors or delete existing colors.
							</Dialog.Description>

							<!-- Close button -->
							<button
								type="button"
								onclick={handleClose}
								class="absolute top-4 right-4 text-ash/60 transition-colors hover:text-bone"
								aria-label="Close modal"
							>
								<X size={20} />
							</button>

							<h2 class="mb-6 font-display text-2xl tracking-wider text-bone">MANAGE COLORS</h2>

							<!-- Existing colors list -->
							<div class="mb-6">
								<h3
									class="mb-2 font-sans text-xs font-semibold tracking-wider text-ash/60 uppercase"
								>
									Existing Colors ({colors.length})
								</h3>
								<div
									class="max-h-48 divide-y divide-ash/5 overflow-y-auto border border-ash/10 bg-void/50 p-2"
								>
									{#if colors.length === 0}
										<p class="py-4 text-center font-sans text-xs text-ash/40">
											No colors created yet.
										</p>
									{:else}
										{#each colors as colorItem (colorItem.id)}
											<div class="flex min-h-10 items-center justify-between py-2">
												{#if deleteConfirmId === colorItem.id}
													<div
														class="flex w-full items-center justify-between border border-red-500/10 bg-red-950/20 px-2 py-1"
													>
														<span class="font-sans text-xs text-red-400">Confirm delete?</span>
														<div class="flex gap-2">
															<button
																type="button"
																onclick={() => executeDelete(colorItem.id)}
																class="font-sans text-[11px] font-bold text-red-400 uppercase transition-colors hover:text-red-300"
															>
																Delete
															</button>
															<button
																type="button"
																onclick={() => (deleteConfirmId = null)}
																class="font-sans text-[11px] font-bold text-ash uppercase transition-colors hover:text-bone"
															>
																Cancel
															</button>
														</div>
													</div>
												{:else}
													<div class="flex items-center gap-2">
														<span
															class="h-4 w-4 rounded-full border border-ash/20"
															style:background={colorItem.hex}
														></span>
														<span class="font-sans text-sm text-bone">{colorItem.name}</span>
														<span class="font-mono text-xs text-ash/50">{colorItem.hex}</span>
													</div>
													<button
														type="button"
														onclick={() => {
															error = null;
															deleteConfirmId = colorItem.id;
														}}
														class="p-1 text-ash/40 transition-colors hover:text-red-400"
														title="Delete Color"
													>
														<Trash2 size={14} />
													</button>
												{/if}
											</div>
										{/each}
									{/if}
								</div>
							</div>

							<!-- Add New Color form -->
							<form onsubmit={handleCreate} class="border-t border-ash/10 pt-4">
								<h3
									class="mb-3 font-sans text-xs font-semibold tracking-wider text-ash/60 uppercase"
								>
									Create New Color
								</h3>

								{#if error}
									<div
										class="mb-3 border border-red-500/20 bg-red-500/10 p-2 font-sans text-xs text-red-400"
									>
										{error}
									</div>
								{/if}

								<div class="grid gap-3">
									<label class="grid gap-1">
										<span class="font-sans text-xs font-semibold text-ash/80">Color Name</span>
										<input
											type="text"
											bind:value={name}
											oninput={(e) => {
												name = formatColorName(e.currentTarget.value);
											}}
											placeholder="e.g. Void Black, Cream Bone"
											disabled={submitting}
											class="min-h-10 border border-ash/20 bg-void px-3 py-1.5 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none focus:border-volt"
										/>
									</label>

									<AdminHexInput label="Color Hex" bind:value={hex} disabled={submitting} />

									<button
										type="submit"
										disabled={submitting || !name.trim()}
										class="mt-2 flex min-h-10 items-center justify-center gap-2 bg-volt px-4 py-2 font-sans text-xs font-bold tracking-wider text-void uppercase transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
									>
										{#if submitting}
											Creating...
										{:else}
											<Plus size={14} />
											Add Color
										{/if}
									</button>
								</div>
							</form>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
