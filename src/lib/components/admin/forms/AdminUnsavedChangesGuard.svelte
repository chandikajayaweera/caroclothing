<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AdminUnsavedChangesModal from './AdminUnsavedChangesModal.svelte';

	let {
		dirty,
		onsave,
		title = 'Save before leaving?',
		description = 'Unsaved changes will be lost if you leave this page.'
	}: {
		dirty: boolean;
		onsave: () => void;
		title?: string;
		description?: string;
	} = $props();

	let open = $state(false);
	let pendingHref = $state<string | null>(null);
	let bypass = false;

	beforeNavigate((navigation) => {
		if (!dirty || bypass || navigation.willUnload || !navigation.to?.url) return;
		navigation.cancel();
		pendingHref = `${navigation.to.url.pathname}${navigation.to.url.search}${navigation.to.url.hash}`;
		open = true;
	});

	function handleBeforeUnload(event: BeforeUnloadEvent) {
		if (!dirty || bypass) return;
		event.preventDefault();
		event.returnValue = '';
	}

	function saveAndStay() {
		open = false;
		pendingHref = null;
		onsave();
	}

	async function discardAndLeave() {
		const target = pendingHref;
		if (!target) {
			open = false;
			return;
		}

		bypass = true;
		open = false;
		await goto(resolve(target as '/'));
	}

	function keepEditing() {
		pendingHref = null;
	}
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<AdminUnsavedChangesModal
	bind:isOpen={open}
	{title}
	{description}
	onsave={saveAndStay}
	ondiscard={discardAndLeave}
	oncancel={keepEditing}
/>
