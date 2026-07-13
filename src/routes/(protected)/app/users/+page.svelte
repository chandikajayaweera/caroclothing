<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { User, Ban, Key, Phone, Clock } from 'lucide-svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminTextarea from '$lib/components/admin/AdminTextarea.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminBadge from '$lib/components/admin/AdminBadge.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';
	import AdminSection from '$lib/components/admin/layout/AdminSection.svelte';
	import AdminFilterBar from '$lib/components/admin/filters/AdminFilterBar.svelte';
	import AdminEntityCard from '$lib/components/admin/data-display/AdminEntityCard.svelte';
	import AdminMetaGrid from '$lib/components/admin/data-display/AdminMetaGrid.svelte';
	import AdminEmptyState from '$lib/components/admin/data-display/AdminEmptyState.svelte';
	import AdminModal from '$lib/components/admin/AdminModal.svelte';
	import AdminDrawer from '$lib/components/admin/AdminDrawer.svelte';
	import AdminConfirmDialog from '$lib/components/admin/AdminConfirmDialog.svelte';
	import AdminTabs from '$lib/components/admin/AdminTabs.svelte';
	import { booleanStatusVariant } from '$lib/shared/admin/status';
	import { formatAdminDateTime } from '$lib/shared/admin/format';

	let { data }: { data: PageData } = $props();
	type UserItem = PageData['users']['items'][number];

	// ── Toast Notifications ──
	let toastMessage = $state<string | null>(null);
	let toastType = $state<'success' | 'error'>('success');

	// ── Dialog States ──
	let userDrawerOpen = $state(false);
	type UserDrawerTab = 'overview' | 'access' | 'sessions';
	let userDrawerTab = $state<UserDrawerTab>('overview');

	let roleConfirmOpen = $state(false);
	let pendingRoleData = $state<{
		userId: string;
		userName: string;
		currentRole: string;
		targetRole: string;
	} | null>(null);

	let suspendModalOpen = $state(false);
	let suspendConfirmOpen = $state(false);
	let suspendFormElement = $state<HTMLFormElement | null>(null);
	let pendingSuspendUser = $state<{ id: string; name: string } | null>(null);

	let unbanConfirmOpen = $state(false);
	let pendingUnbanUser = $state<{ id: string; name: string } | null>(null);

	let revokeConfirmOpen = $state(false);
	let pendingRevokeUser = $state<{ id: string; name: string; sessionIds?: string[] } | null>(null);
	let revokeFormElement = $state<HTMLFormElement | null>(null);

	function initialForm<T>(getValue: () => T): T {
		return getValue();
	}

	// ── Superforms Hookups ──

	// 1. Set Role
	const setRoleSuperform = superForm(
		initialForm(() => data.setUserRoleForm),
		{
			id: 'setUserRole',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'User role updated.';
					toastType = 'success';
					roleConfirmOpen = false;
					// Refresh selected user if current is open
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
				} else {
					toastMessage = form.message ?? 'User role could not be updated.';
					toastType = 'error';
				}
			}
		}
	);
	const { enhance: roleEnhance, submitting: roleSubmitting } = setRoleSuperform;

	// 2. Ban User
	const banSuperform = superForm(
		initialForm(() => data.banUserForm),
		{
			id: 'banUser',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'User account suspended.';
					toastType = 'success';
					suspendModalOpen = false;
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
				} else {
					toastMessage = form.message ?? 'User account could not be suspended.';
					toastType = 'error';
				}
			}
		}
	);
	const {
		form: banForm,
		errors: banErrors,
		enhance: banEnhance,
		submitting: banSubmitting
	} = banSuperform;

	// 3. Unban User
	const unbanSuperform = superForm(
		initialForm(() => data.unbanUserForm),
		{
			id: 'unbanUser',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'User account unsuspended.';
					toastType = 'success';
					unbanConfirmOpen = false;
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
				} else {
					toastMessage = form.message ?? 'Suspension could not be lifted.';
					toastType = 'error';
				}
			}
		}
	);
	const { form: unbanForm, enhance: unbanEnhance, submitting: unbanSubmitting } = unbanSuperform;

	// 4. Revoke Sessions
	const revokeSessionsSuperform = superForm(
		initialForm(() => data.revokeSessionsForm),
		{
			id: 'revokeUserSessions',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'User sessions updated.';
					toastType = 'success';
					revokeConfirmOpen = false;
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
				} else {
					toastMessage = form.message ?? 'Sessions could not be revoked.';
					toastType = 'error';
				}
			}
		}
	);
	const {
		form: revokeForm,
		enhance: revokeEnhance,
		submitting: revokeSubmitting
	} = revokeSessionsSuperform;

	// 5. Repair Email
	const repairEmailSuperform = superForm(
		initialForm(() => data.repairEmailForm),
		{
			id: 'repairUserEmail',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'Email repaired successfully.';
					toastType = 'success';
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
				} else {
					toastMessage = form.message ?? 'Email could not be repaired.';
					toastType = 'error';
				}
			}
		}
	);
	const { enhance: repairEnhance, submitting: repairSubmitting } = repairEmailSuperform;

	function triggerSuspendUser(userId: string, userName: string) {
		$banForm.userId = userId;
		$banForm.reason = '';
		$banForm.expiresAt = '';
		$banForm.revokeSessions = true;
		pendingSuspendUser = { id: userId, name: userName };
		suspendModalOpen = true;
	}

	function triggerLiftSuspension(userId: string, userName: string) {
		$unbanForm.userId = userId;
		pendingUnbanUser = { id: userId, name: userName };
		unbanConfirmOpen = true;
	}

	function triggerRevokeSessions(userId: string, userName: string, sessionIds?: string[]) {
		$revokeForm.userId = userId;
		$revokeForm.sessionIds = sessionIds;
		pendingRevokeUser = { id: userId, name: userName, sessionIds };
		revokeConfirmOpen = true;
	}

	function confirmSuspend() {
		suspendFormElement?.requestSubmit();
		suspendConfirmOpen = false;
	}

	function confirmRevokeSessions() {
		revokeFormElement?.requestSubmit();
	}

	function exportToCSV() {
		const items = data.users.items;
		if (items.length === 0) return;

		const headers = [
			'User ID',
			'Name',
			'Email',
			'Phone Number',
			'Role',
			'Status',
			'Registered At',
			'Session Count',
			'Last Active At',
			'Last Active IP',
			'Last Active User Agent'
		];

		const rows = items.map((u) => [
			u.id,
			u.name || 'Anonymous User',
			u.email || '',
			u.phoneNumber || '',
			u.role === 'adminUser' ? 'Admin' : 'Customer',
			u.isBanned ? 'Suspended' : 'Active',
			u.createdAt ? new Date(u.createdAt).toISOString() : '',
			u.sessionCount,
			u.lastActiveAt ? new Date(u.lastActiveAt).toISOString() : '',
			u.lastActiveIp || '',
			u.lastActiveUserAgent || ''
		]);

		function csvCell(rawValue: unknown): string {
			let value = String(rawValue ?? '');
			if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
			return `"${value.replaceAll('"', '""')}"`;
		}

		const csvContent = [
			headers.map(csvCell).join(','),
			...rows.map((row) => row.map(csvCell).join(','))
		].join('\r\n');
		const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8' });
		const objectUrl = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', objectUrl);
		link.setAttribute('download', `users_export_${new Date().toISOString().split('T')[0]}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(objectUrl);
	}

	const formatDate = formatAdminDateTime;

	// ── Navigation & Drawer Control ──
	function selectUser(userId: string) {
		userDrawerTab = 'overview';
		const url = new URL(page.url);
		url.searchParams.set('userId', userId);
		goto(resolve(`${url.pathname}${url.search}` as '/'), {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	function closeUserDrawer() {
		userDrawerOpen = false;
		userDrawerTab = 'overview';
		const url = new URL(page.url);
		url.searchParams.delete('userId');
		goto(resolve(`${url.pathname}${url.search}` as '/'), {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	function changeUserDrawerTab(value: string) {
		if (value === 'overview' || value === 'access' || value === 'sessions') {
			userDrawerTab = value;
		}
	}

	function refreshDrawer(userId: string) {
		const url = new URL(page.url);
		url.searchParams.set('userId', userId);
		goto(resolve(`${url.pathname}${url.search}` as '/'), {
			keepFocus: true,
			noScroll: true,
			invalidateAll: true
		});
	}

	$effect(() => {
		if (data.selectedUser) {
			userDrawerOpen = true;
		} else {
			userDrawerOpen = false;
		}
	});

	// ── Filters & Metrics ──
	const userHeaders = [
		{ label: 'User Profile' },
		{ label: 'Role' },
		{ label: 'Auth Methods', class: 'hidden xl:table-cell' },
		{ label: 'Status' },
		{ label: 'Registered', class: 'hidden xl:table-cell' },
		{ label: 'Sessions' },
		{ label: 'Actions', class: 'text-end' }
	];

	const userStats = $derived({
		total: data.users.total,
		active: data.users.items.filter((u: UserItem) => !u.isBanned).length,
		inactive: data.users.items.filter((u: UserItem) => u.isBanned).length
	});

	const hasActiveFilters = $derived(
		data.filters.query !== '' ||
			data.filters.role !== '' ||
			data.filters.banned !== '' ||
			data.filters.provider !== '' ||
			data.filters.createdAfter !== '' ||
			data.filters.createdBefore !== ''
	);

	function clearFilters() {
		goto(resolve(page.url.pathname as '/'), { invalidateAll: true });
	}

	function updateFilter(key: string, value: string) {
		const url = new URL(page.url);
		if (value) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
		url.searchParams.delete('offset');
		goto(resolve(`${url.pathname}${url.search}` as '/'), { invalidateAll: true });
	}
</script>

<!-- TOASTS -->
{#if toastMessage}
	<AdminToast message={toastMessage} type={toastType} onclose={() => (toastMessage = null)} />
{/if}

<AdminListLayout
	title="Users"
	kicker="Customers & Admins"
	actionMessage={null}
	metrics={[
		{ label: 'Filtered Users', value: userStats.total },
		{ label: 'Active on Page', value: userStats.active, tone: 'success' },
		{ label: 'Suspended on Page', value: userStats.inactive, tone: 'danger' }
	]}
	totalItems={data.users.total}
	limit={data.users.limit}
	offset={data.users.offset}
	tableHeaders={userHeaders}
	items={data.users.items}
	query={data.filters.query}
	searchPlaceholder="Search by name, email, or phone..."
	{hasActiveFilters}
	onclearfilters={clearFilters}
	gridClass="grid gap-3 p-3 md:grid-cols-2 md:p-4 lg:hidden"
	tableClass="hidden overflow-x-auto lg:block"
>
	{#snippet headerActions()}
		<AdminButton
			type="button"
			variant="charcoal"
			size="sm"
			onclick={exportToCSV}
			class="font-mono text-xs uppercase"
		>
			Export Page
		</AdminButton>
	{/snippet}

	{#snippet advancedFilters()}
		<AdminFilterBar cols={4} class="mt-2">
			<AdminSelect
				label="Filter Role"
				name="role"
				value={data.filters.role}
				onchange={(e) => updateFilter('role', (e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">All Roles</option>
				<option value="customerUser">Customer</option>
				<option value="adminUser">Administrator</option>
			</AdminSelect>

			<AdminSelect
				label="Filter Status"
				name="banned"
				value={data.filters.banned}
				onchange={(e) => updateFilter('banned', (e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">All Statuses</option>
				<option value="false">Active Only</option>
				<option value="true">Suspended Only</option>
			</AdminSelect>

			<AdminSelect
				label="Auth Provider"
				name="provider"
				value={data.filters.provider}
				onchange={(e) => updateFilter('provider', (e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">All Providers</option>
				<option value="google">Google Link</option>
				<option value="phone">Phone OTP</option>
				<option value="anonymous">Anonymous User</option>
			</AdminSelect>

			<div class="grid gap-2 min-[430px]:grid-cols-2">
				<AdminInput
					label="Registered After"
					name="createdAfter"
					type="date"
					value={data.filters.createdAfter}
					onchange={(e: Event) =>
						updateFilter('createdAfter', (e.currentTarget as HTMLInputElement).value)}
				/>
				<AdminInput
					label="Registered Before"
					name="createdBefore"
					type="date"
					value={data.filters.createdBefore}
					onchange={(e: Event) =>
						updateFilter('createdBefore', (e.currentTarget as HTMLInputElement).value)}
				/>
			</div>
		</AdminFilterBar>
	{/snippet}

	{#snippet row(userRow)}
		<tr class="border-b border-charcoal/70 transition-colors last:border-b-0 hover:bg-charcoal/10">
			<!-- User Profile -->
			<td class="px-5 py-4">
				<div class="flex items-center gap-3">
					<div
						class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-charcoal bg-charcoal text-volt"
					>
						{#if userRow.image}
							<img src={userRow.image} alt={userRow.name} class="h-full w-full object-cover" />
						{:else}
							<User size={14} />
						{/if}
					</div>
					<div>
						<div class="font-mono text-xs font-semibold text-bone uppercase">
							{userRow.name || 'Anonymous User'}
						</div>
						<div class="mt-0.5 font-sans text-xs text-ash/80">
							{userRow.email || 'No email'}
						</div>
						{#if userRow.phoneNumber}
							<div class="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-ash/60">
								<Phone size={12} />
								{userRow.phoneNumber}
							</div>
						{/if}
						{#if userRow.lastActiveAt}
							<div
								class="mt-1 flex cursor-help items-center gap-1 font-mono text-[9px] text-ash/40"
								title="Last Active IP: {userRow.lastActiveIp ||
									'Unknown'}&#10;UA: {userRow.lastActiveUserAgent || 'Unknown'}"
							>
								<Clock size={12} class="text-volt" /> Active: {formatDate(userRow.lastActiveAt)}
							</div>
						{/if}
					</div>
				</div>
			</td>

			<!-- Role -->
			<td class="px-5 py-4">
				<AdminBadge variant={userRow.role === 'adminUser' ? 'accent' : 'neutral'} size="sm">
					{userRow.role === 'adminUser' ? 'ADMIN' : 'CUSTOMER'}
				</AdminBadge>
			</td>

			<!-- Auth Methods Count -->
			<td class="hidden px-5 py-4 xl:table-cell">
				<span class="flex items-center gap-1 font-sans text-xs text-bone">
					<Key size={11} class="text-volt" />
					{userRow.authMethodCount} linked
				</span>
			</td>

			<!-- Status -->
			<td class="px-5 py-4">
				<AdminBadge variant={booleanStatusVariant(!userRow.isBanned)} size="sm">
					{userRow.isBanned ? 'SUSPENDED' : 'ACTIVE'}
				</AdminBadge>
			</td>

			<!-- Registered -->
			<td class="hidden px-5 py-4 font-mono text-[10px] text-ash xl:table-cell">
				{formatDate(userRow.createdAt)}
			</td>

			<!-- Sessions Count -->
			<td class="px-5 py-4 font-mono text-xs text-bone">
				{userRow.sessionCount} active
			</td>

			<!-- Actions -->
			<td class="px-5 py-4 text-right">
				<AdminButton
					type="button"
					variant="volt"
					size="sm"
					onclick={() => selectUser(userRow.id)}
					class="font-mono text-[10px] tracking-wider uppercase"
				>
					Manage
				</AdminButton>
			</td>
		</tr>
	{/snippet}

	{#snippet card(userRow)}
		<AdminEntityCard>
			{#snippet header()}
				<div class="flex items-start justify-between">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-charcoal text-volt"
						>
							{#if userRow.image}
								<img src={userRow.image} alt={userRow.name} class="h-full w-full object-cover" />
							{:else}
								<User size={16} />
							{/if}
						</div>
						<div>
							<h3 class="font-display text-xl leading-tight text-bone uppercase">
								{userRow.name || 'Anonymous User'}
							</h3>
							<p class="mt-0.5 font-sans text-xs text-ash">{userRow.email || 'No email'}</p>

							<!-- Sleek inline badges row -->
							<div class="mt-2 flex flex-wrap gap-1.5">
								<!-- Status Badge -->
								<AdminBadge variant={booleanStatusVariant(!userRow.isBanned)} size="xs">
									{userRow.isBanned ? 'Suspended' : 'Active'}
								</AdminBadge>

								<!-- Auth Methods Badges -->
								{#each userRow.authMethods || [] as method (`${method.type}-${method.label}`)}
									<AdminBadge variant="neutral" size="xs">
										{method.type === 'anonymous' ? 'GUEST' : method.type}
									</AdminBadge>
								{/each}

								<!-- Sessions Badge -->
								<AdminBadge variant="neutral" size="xs">
									{userRow.sessionCount}
									{userRow.sessionCount === 1 ? 'Session' : 'Sessions'}
								</AdminBadge>
							</div>
						</div>
					</div>
					<AdminBadge variant={userRow.role === 'adminUser' ? 'accent' : 'neutral'} size="sm">
						{userRow.role === 'adminUser' ? 'Admin' : 'Customer'}
					</AdminBadge>
				</div>
			{/snippet}

			{#snippet metadata()}
				<AdminMetaGrid cols={1} class="border-t border-ash/10 pt-3">
					{#if userRow.phoneNumber}
						<div class="flex justify-between text-ash/60">
							<span>Phone:</span>
							<span class="text-bone">{userRow.phoneNumber}</span>
						</div>
					{/if}
					{#if userRow.lastActiveAt}
						<div class="flex justify-between text-ash/60">
							<span>Last Active:</span>
							<span>{formatDate(userRow.lastActiveAt)}</span>
						</div>
					{/if}
				</AdminMetaGrid>
			{/snippet}

			{#snippet actions()}
				<div class="border-t border-ash/10 pt-3">
					<AdminButton
						type="button"
						variant="volt"
						size="sm"
						onclick={() => selectUser(userRow.id)}
						class="w-full font-mono text-[10px] tracking-wider uppercase"
					>
						Manage
					</AdminButton>
				</div>
			{/snippet}
		</AdminEntityCard>
	{/snippet}

	{#snippet emptyState()}
		<AdminEmptyState title="No users found" description="Adjust search terms or filters." />
	{/snippet}
</AdminListLayout>

{#if userDrawerOpen && data.selectedUser}
	{@const selectedUser = data.selectedUser}
	<AdminDrawer
		bind:open={userDrawerOpen}
		title={selectedUser.name || 'Anonymous User'}
		description="User account management details, auth keys, sessions, and ban panels."
		size="lg"
		onOpenChange={(open) => {
			if (!open) closeUserDrawer();
		}}
	>
		<!-- Top Info card -->
		<div class="mb-6 flex items-center gap-4 border-b border-ash/10 pb-4">
			<div
				class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-charcoal bg-void text-volt"
			>
				{#if selectedUser.image}
					<img
						src={selectedUser.image}
						alt={selectedUser.name}
						class="h-full w-full object-cover"
					/>
				{:else}
					<User size={20} />
				{/if}
			</div>
			<div>
				<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">Email Address</p>
				<p class="mt-0.5 min-w-0 font-sans text-sm break-all text-bone">
					{selectedUser.email || 'No email address registered'}
				</p>
			</div>
		</div>

		<AdminTabs
			label="User management views"
			value={userDrawerTab}
			items={[
				{ value: 'overview', label: 'Overview' },
				{ value: 'access', label: 'Access' },
				{
					value: 'sessions',
					label: 'Sessions',
					count: data.selectedUserSessions?.length ?? 0
				}
			]}
			onchange={changeUserDrawerTab}
			class="mb-5"
		/>

		<div class="flex flex-col gap-6">
			{#if userDrawerTab === 'overview'}
				<!-- Info Grid -->
				<AdminMetaGrid cols={2} class="mt-0 border border-ash/5 bg-void/50 p-4">
					<div class="font-mono text-[10px] text-ash uppercase">
						<span>User ID:</span>
						<p class="mt-1 font-mono text-xs font-semibold text-bone select-all">
							{selectedUser.id}
						</p>
					</div>
					<div class="font-mono text-[10px] text-ash uppercase">
						<span>Role:</span>
						<div class="mt-1">
							<AdminBadge
								variant={selectedUser.role === 'adminUser' ? 'accent' : 'neutral'}
								size="xs"
							>
								{selectedUser.role === 'adminUser' ? 'Administrator' : 'Customer'}
							</AdminBadge>
						</div>
					</div>
					<div class="mt-2 font-mono text-[10px] text-ash uppercase">
						<span>Phone:</span>
						<p class="mt-1 text-xs text-bone">{selectedUser.phoneNumber || '—'}</p>
					</div>
					<div class="mt-2 font-mono text-[10px] text-ash uppercase">
						<span>Member Since:</span>
						<p class="mt-1 text-xs text-bone">{formatDate(selectedUser.createdAt)}</p>
					</div>
				</AdminMetaGrid>

				<!-- Last Active Details -->
				{#if selectedUser.lastActiveAt}
					<div class="rounded-xs border border-ash/5 bg-void/35 p-4">
						<h3
							class="flex items-center gap-1.5 border-b border-ash/10 pb-1.5 font-mono text-[10px] font-semibold tracking-wider text-ash uppercase"
						>
							<Clock size={11} class="text-volt" /> Last Activity Details
						</h3>
						<AdminMetaGrid cols={2}>
							<div class="font-mono text-[10px] text-ash uppercase">
								<span>Active Time:</span>
								<p class="mt-1 text-xs text-bone">
									{formatDate(selectedUser.lastActiveAt)}
								</p>
							</div>
							<div class="font-mono text-[10px] text-ash uppercase">
								<span>IP Address:</span>
								<p class="mt-1 text-xs text-bone">
									{selectedUser.lastActiveIp || 'Unknown'}
								</p>
							</div>
							<div class="font-mono text-[10px] text-ash uppercase min-[430px]:col-span-2">
								<span>Device / User Agent:</span>
								<p class="mt-1 font-sans text-xs leading-normal wrap-break-word text-ash/90">
									{selectedUser.lastActiveUserAgent || 'Unknown'}
								</p>
							</div>
						</AdminMetaGrid>
					</div>
				{/if}

				<!-- Linked Credentials -->
				<div>
					<h3
						class="border-b border-ash/10 pb-1.5 font-mono text-[10px] font-semibold tracking-wider text-ash uppercase"
					>
						Linked Credentials
					</h3>
					<div class="mt-3 flex flex-col gap-2">
						{#if selectedUser.authMethods && selectedUser.authMethods.length > 0}
							{#each selectedUser.authMethods as method (`${method.type}-${method.label}`)}
								<div
									class="flex flex-col items-start gap-3 rounded-xs border border-ash/5 bg-void/35 p-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div class="min-w-0">
										<span class="font-mono text-xs font-semibold text-bone uppercase"
											>{method.type}</span
										>
										<p class="mt-1 font-sans text-[11px] break-all text-ash/80 select-all">
											{method.label}
										</p>
									</div>
									<span class="font-mono text-[9px] tracking-widest text-ash/60">
										LINKED {formatDate(method.linkedAt)}
									</span>
								</div>
							{/each}
						{:else}
							<p class="font-sans text-xs text-ash/60">No explicit linked auth methods found.</p>
						{/if}
					</div>
				</div>
			{/if}

			{#if userDrawerTab === 'access'}
				<AdminSection title="Role and permissions">
					<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
						<div>
							<p class="font-sans text-xs leading-relaxed text-ash">
								Current access level controls admin routes and operational permissions.
							</p>
							<div class="mt-3">
								<AdminBadge
									variant={selectedUser.role === 'adminUser' ? 'accent' : 'neutral'}
									size="xs"
								>
									{selectedUser.role === 'adminUser' ? 'Administrator' : 'Customer'}
								</AdminBadge>
							</div>
						</div>
						<AdminButton
							type="button"
							variant="outline"
							onclick={() => {
								pendingRoleData = {
									userId: selectedUser.id,
									userName: selectedUser.name || 'Anonymous User',
									currentRole: selectedUser.role || 'customerUser',
									targetRole: selectedUser.role === 'adminUser' ? 'customerUser' : 'adminUser'
								};
								roleConfirmOpen = true;
							}}
						>
							Change role
						</AdminButton>
					</div>
				</AdminSection>

				{#if selectedUser.hasInternalEmail && selectedUser.authMethods?.some((m) => m.type === 'google')}
					<AdminSection title="Email repair">
						<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
							<p class="font-sans text-xs leading-relaxed text-ash">
								Replace temporary phone or anonymous email with linked Google profile email.
							</p>
							<form method="POST" action="?/repairEmail" use:repairEnhance>
								<input type="hidden" name="userId" value={selectedUser.id} />
								<AdminButton type="submit" variant="volt" disabled={$repairSubmitting}>
									{$repairSubmitting ? 'Repairing...' : 'Repair email'}
								</AdminButton>
							</form>
						</div>
					</AdminSection>
				{/if}
			{/if}

			{#if userDrawerTab === 'sessions'}
				<!-- Sessions Management -->
				<div>
					<div
						class="flex flex-col items-start gap-3 border-b border-ash/10 pb-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<h3 class="font-mono text-[10px] font-semibold tracking-wider text-ash uppercase">
							Active Sessions
						</h3>
						{#if data.selectedUserSessions && data.selectedUserSessions.length > 0}
							<AdminButton
								type="button"
								variant="danger"
								size="sm"
								disabled={$revokeSubmitting}
								onclick={() =>
									triggerRevokeSessions(selectedUser.id, selectedUser.name || 'Anonymous User')}
							>
								Revoke All Sessions
							</AdminButton>
						{/if}
					</div>

					<div class="mt-3 flex max-h-55 flex-col gap-2 overflow-y-auto pr-1">
						{#if data.selectedUserSessions && data.selectedUserSessions.length > 0}
							{#each data.selectedUserSessions as session (session.id)}
								<div
									class="flex flex-col items-stretch gap-3 rounded-xs border border-ash/5 bg-void/35 p-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<span class="font-mono text-[11px] font-semibold text-bone"
												>{session.ipAddress || 'Unknown IP'}</span
											>
											{#if session.id === data.session?.id}
												<AdminBadge variant="success" size="xs">Current</AdminBadge>
											{/if}
										</div>
										<p class="mt-1 font-sans text-[10px] break-words text-ash/80">
											{session.userAgent || 'Unknown Device'}
										</p>
										<p class="mt-1 flex items-center gap-1 font-mono text-[9px] text-ash/60">
											<Clock size={12} /> Expires: {formatDate(session.expiresAt)}
										</p>
									</div>

									{#if session.id !== data.session?.id}
										<AdminButton
											type="button"
											variant="outline"
											size="sm"
											class="text-red-400"
											disabled={$revokeSubmitting}
											onclick={() =>
												triggerRevokeSessions(
													selectedUser.id,
													selectedUser.name || 'Anonymous User',
													[session.id]
												)}
										>
											Revoke
										</AdminButton>
									{/if}
								</div>
							{/each}
						{:else}
							<p class="font-sans text-xs text-ash/60">No active sessions found.</p>
						{/if}
					</div>
				</div>
			{/if}

			{#if userDrawerTab === 'access'}
				<!-- Ban / Suspension Panel -->
				<AdminSection title="Account operations">
					<div class="space-y-3">
						{#if selectedUser.isBanned}
							<div class="flex flex-col gap-2 rounded-xs border border-red-500/20 bg-red-500/5 p-4">
								<div class="flex items-center gap-2 text-red-400">
									<Ban size={16} />
									<span class="font-mono text-xs font-bold uppercase">Suspended Account</span>
								</div>
								{#if selectedUser.banReason}
									<p class="font-sans text-xs text-bone">
										Reason: <span class="text-ash/90">{selectedUser.banReason}</span>
									</p>
								{/if}
								<div class="flex justify-between font-mono text-[10px] text-ash">
									<span>Expires:</span>
									<span class="text-bone"
										>{selectedUser.banExpires
											? formatDate(selectedUser.banExpires)
											: 'Permanent'}</span
									>
								</div>
							</div>

							<AdminButton
								type="button"
								variant="volt"
								class="w-full font-mono text-xs uppercase"
								onclick={() => {
									triggerLiftSuspension(selectedUser.id, selectedUser.name || 'Anonymous User');
								}}
							>
								Lift Suspension
							</AdminButton>
						{:else}
							<AdminButton
								type="button"
								variant="danger"
								class="w-full"
								onclick={() =>
									triggerSuspendUser(selectedUser.id, selectedUser.name || 'Anonymous User')}
							>
								Suspend User Account
							</AdminButton>
						{/if}
					</div>
				</AdminSection>
			{/if}
		</div>

		{#snippet footer()}
			<AdminButton type="button" variant="outline" onclick={() => (userDrawerOpen = false)}>
				Close Details
			</AdminButton>
		{/snippet}
	</AdminDrawer>
{/if}

<!-- ROLE SWAP CONFIRMATION DIALOG -->
{#if roleConfirmOpen && pendingRoleData}
	{@const pending = pendingRoleData}
	<AdminModal
		bind:open={roleConfirmOpen}
		kicker="Confirm Role Change"
		title="Change Role"
		size="sm"
	>
		<div class="space-y-6">
			<p class="font-sans text-xs leading-relaxed text-ash">
				Are you sure you want to change the role of <strong>{pending.userName}</strong>? This will
				modify their permissions immediately.
			</p>

			<AdminMetaGrid cols={1} class="mt-0 border border-ash/10 bg-void/50 p-4">
				<div>
					<span class="text-ash uppercase">User:</span>
					<span class="ml-2 font-semibold text-bone">{pending.userName}</span>
				</div>
				<div>
					<span class="text-ash uppercase">Current Role:</span>
					<AdminBadge variant="neutral" size="xs">
						{pending.currentRole === 'adminUser' ? 'Admin' : 'Customer'}
					</AdminBadge>
				</div>
				<div>
					<span class="text-ash uppercase">New Role:</span>
					<AdminBadge variant="accent" size="xs">
						{pending.targetRole === 'adminUser' ? 'Admin' : 'Customer'}
					</AdminBadge>
				</div>
			</AdminMetaGrid>

			<div class="flex justify-end gap-3 pt-2">
				<AdminButton type="button" variant="charcoal" onclick={() => (roleConfirmOpen = false)}>
					Cancel
				</AdminButton>
				<form method="POST" action="?/setRole" use:roleEnhance class="inline-block">
					<input type="hidden" name="userId" value={pending.userId} />
					<input type="hidden" name="role" value={pending.targetRole} />
					<AdminButton type="submit" variant="volt" disabled={$roleSubmitting}>
						Confirm Change
					</AdminButton>
				</form>
			</div>
		</div>
	</AdminModal>
{/if}

<!-- SUSPEND USER DIALOG -->
{#if suspendModalOpen && pendingSuspendUser}
	{@const pending = pendingSuspendUser}
	<AdminModal
		bind:open={suspendModalOpen}
		kicker="Suspend User Account"
		title="Suspend Account"
		size="lg"
	>
		<p class="font-sans text-xs leading-relaxed text-ash">
			Suspend access to the store for <strong>{pending.name}</strong>.
		</p>

		<form
			bind:this={suspendFormElement}
			method="POST"
			action="?/ban"
			use:banEnhance
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="userId" value={pending.id} />

			<AdminTextarea
				label="Reason for Suspension"
				name="reason"
				bind:value={$banForm.reason}
				placeholder="Internal reason or policy violation details..."
				error={$banErrors.reason}
			/>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<AdminInput
					label="Ban Expiration (Optional)"
					type="datetime-local"
					name="expiresAt"
					bind:value={$banForm.expiresAt}
					error={$banErrors.expiresAt}
				/>

				<div class="flex h-full items-center pt-6">
					<AdminToggle
						label="Terminate Active Sessions"
						description="Forces immediate logout on all devices"
						name="revokeSessions"
						bind:checked={$banForm.revokeSessions}
					/>
				</div>
			</div>

			<div class="flex justify-end gap-3 border-t border-ash/10 pt-4">
				<AdminButton type="button" variant="charcoal" onclick={() => (suspendModalOpen = false)}>
					Cancel
				</AdminButton>
				<AdminButton
					type="button"
					variant="danger"
					disabled={$banSubmitting}
					onclick={() => (suspendConfirmOpen = true)}
				>
					{#if $banSubmitting}Suspending...{:else}Suspend Account{/if}
				</AdminButton>
			</div>
		</form>
	</AdminModal>
{/if}

<AdminConfirmDialog
	bind:open={suspendConfirmOpen}
	title="Suspend account"
	message={`Suspend ${pendingSuspendUser?.name ?? 'this user'}${$banForm.revokeSessions ? ' and terminate active sessions' : ''}?`}
	confirmLabel="Suspend account"
	loading={$banSubmitting}
	onconfirm={confirmSuspend}
/>

<!-- LIFT SUSPENSION CONFIRMATION DIALOG -->
{#if unbanConfirmOpen && pendingUnbanUser}
	{@const pending = pendingUnbanUser}
	<AdminModal
		bind:open={unbanConfirmOpen}
		kicker="Lift Suspension"
		title="Lift Suspension"
		size="sm"
	>
		<p class="font-sans text-xs leading-relaxed text-ash">
			Are you sure you want to lift the suspension for <strong>{pending.name}</strong>? They will
			regain access to their account immediately.
		</p>

		<div class="flex justify-end gap-3 pt-2">
			<AdminButton type="button" variant="charcoal" onclick={() => (unbanConfirmOpen = false)}>
				Cancel
			</AdminButton>
			<form method="POST" action="?/unban" use:unbanEnhance class="inline-block">
				<input type="hidden" name="userId" value={pending.id} />
				<AdminButton type="submit" variant="volt" disabled={$unbanSubmitting}>
					Confirm Lift
				</AdminButton>
			</form>
		</div>
	</AdminModal>
{/if}

{#if pendingRevokeUser}
	<form bind:this={revokeFormElement} method="POST" action="?/revokeSessions" use:revokeEnhance>
		<input type="hidden" name="userId" value={pendingRevokeUser.id} />
		{#each pendingRevokeUser.sessionIds ?? [] as sessionId (sessionId)}
			<input type="hidden" name="sessionIds" value={sessionId} />
		{/each}
	</form>
{/if}

<AdminConfirmDialog
	bind:open={revokeConfirmOpen}
	title="Revoke sessions"
	message={pendingRevokeUser?.sessionIds?.length
		? `Terminate the selected session for ${pendingRevokeUser.name}?`
		: `Terminate all active sessions for ${pendingRevokeUser?.name ?? 'this user'}?`}
	confirmLabel="Confirm logout"
	loading={$revokeSubmitting}
	onconfirm={confirmRevokeSessions}
/>
