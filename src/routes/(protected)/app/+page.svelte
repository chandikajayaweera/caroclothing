<script lang="ts">
	import { authClient } from '$lib/client/modules/auth';
	import { goto } from '$app/navigation';

	async function handleLogout() {
		const { error } = await authClient.signOut();
		goto('/login', { invalidateAll: true });

		if (error) {
			console.error(error);
		} else {
			console.log('Logged out successfully');
		}
	}
</script>

<button onclick={handleLogout}>Logout</button>
