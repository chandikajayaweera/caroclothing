<script lang="ts">
	import AdminScaffoldPage from '$lib/components/admin/AdminScaffoldPage.svelte';
</script>

<AdminScaffoldPage
	kicker="Services"
	title="Notifications"
	description="Manage email and SMS communication paths for OTP, welcome, security, marketing, and transactional messages."
	primaryAction="Send Test"
	items={['Email senders', 'SMS sender', 'Template preview', 'Delivery log']}
/>
