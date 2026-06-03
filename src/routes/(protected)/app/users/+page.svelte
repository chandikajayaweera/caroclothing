<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { superForm } from 'sveltekit-superforms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import {
		Search,
		Shield,
		ShieldAlert,
		User,
		UserCheck,
		UserX,
		Ban,
		Key,
		RefreshCw,
		X,
		Calendar,
		Mail,
		Phone,
		LogOut,
		Clock,
		AlertTriangle
	} from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { Dialog } from 'bits-ui';
	import AdminInput from '$lib/components/admin/AdminInput.svelte';
	import AdminSelect from '$lib/components/admin/AdminSelect.svelte';
	import AdminToggle from '$lib/components/admin/AdminToggle.svelte';
	import AdminButton from '$lib/components/admin/AdminButton.svelte';
	import AdminCard from '$lib/components/admin/AdminCard.svelte';
	import AdminToast from '$lib/components/admin/AdminToast.svelte';
	import AdminListLayout from '$lib/components/admin/layout/AdminListLayout.svelte';

	let { data, form: actionData }: { data: PageData; form?: ActionData } = $props();

	// ── Toast Notifications ──
	let toastMessage = $state<string | null>(null);

	// ── Dialog States ──
	let userDrawerOpen = $state(false);

	let roleConfirmOpen = $state(false);
	let pendingRoleData = $state<{
		userId: string;
		userName: string;
		currentRole: string;
		targetRole: string;
	} | null>(null);

	let suspendModalOpen = $state(false);
	let pendingSuspendUser = $state<{ id: string; name: string } | null>(null);

	let unbanConfirmOpen = $state(false);
	let pendingUnbanUser = $state<{ id: string; name: string } | null>(null);

	let revokeConfirmOpen = $state(false);
	let pendingRevokeUser = $state<{ id: string; name: string } | null>(null);

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
					roleConfirmOpen = false;
					// Refresh selected user if current is open
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
				}
			}
		}
	);
	const { form: roleForm, enhance: roleEnhance, submitting: roleSubmitting } = setRoleSuperform;

	// 2. Ban User
	const banSuperform = superForm(
		initialForm(() => data.banUserForm),
		{
			id: 'banUser',
			resetForm: true,
			onUpdated({ form }) {
				if (form.valid) {
					toastMessage = form.message ?? 'User account suspended.';
					suspendModalOpen = false;
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
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
					unbanConfirmOpen = false;
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
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
					revokeConfirmOpen = false;
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
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
					if (data.selectedUser && data.selectedUser.id === form.data.userId) {
						refreshDrawer(form.data.userId);
					}
				}
			}
		}
	);
	const {
		form: repairForm,
		enhance: repairEnhance,
		submitting: repairSubmitting
	} = repairEmailSuperform;

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

	function triggerRevokeSessions(userId: string, userName: string) {
		$revokeForm.userId = userId;
		pendingRevokeUser = { id: userId, name: userName };
		revokeConfirmOpen = true;
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

		const csvContent =
			'data:text/csv;charset=utf-8,' +
			[
				headers.join(','),
				...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
			].join('\n');

		const encodedUri = encodeURI(csvContent);
		const link = document.createElement('a');
		link.setAttribute('href', encodedUri);
		link.setAttribute('download', `users_export_${new Date().toISOString().split('T')[0]}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	// ── Date Formatting Helpers ──
	function formatDate(value: Date | string | null | undefined): string {
		if (!value) return 'Never';
		return new Intl.DateTimeFormat('en-LK', {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	// ── Navigation & Drawer Control ──
	function selectUser(userId: string) {
		const url = new URL(page.url);
		url.searchParams.set('userId', userId);
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
	}

	function closeUserDrawer() {
		userDrawerOpen = false;
		const url = new URL(page.url);
		url.searchParams.delete('userId');
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
	}

	function refreshDrawer(userId: string) {
		const url = new URL(page.url);
		url.searchParams.set('userId', userId);
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true, invalidateAll: true });
	}

	$effect(() => {
		if (data.selectedUser) {
			userDrawerOpen = true;
		} else {
			userDrawerOpen = false;
		}
	});

	// ── Dropdown State & Click-outside Handling ──
	let activeDropdownUserId = $state<string | null>(null);

	function toggleDropdown(userId: string, event: Event) {
		event.stopPropagation();
		if (activeDropdownUserId === userId) {
			activeDropdownUserId = null;
		} else {
			activeDropdownUserId = userId;
		}
	}

	$effect(() => {
		const handleOutsideClick = (e: MouseEvent) => {
			if (activeDropdownUserId) {
				const target = e.target as HTMLElement;
				if (!target.closest('.user-dropdown-container')) {
					activeDropdownUserId = null;
				}
			}
		};
		document.addEventListener('click', handleOutsideClick);
		return () => {
			document.removeEventListener('click', handleOutsideClick);
		};
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
		active: data.users.items.filter((u: any) => !u.isBanned).length,
		inactive: data.users.items.filter((u: any) => u.isBanned).length
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
		goto(page.url.pathname, { invalidateAll: true });
	}
</script>

<!-- TOASTS -->
{#if toastMessage}
	<AdminToast message={toastMessage} onclose={() => (toastMessage = null)} />
{/if}

<AdminListLayout
	title="Users"
	kicker="Customers & Admins"
	actionMessage={null}
	stats={userStats}
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
	tableClass="hidden overflow-hidden lg:block"
>
	{#snippet headerActions()}
		<AdminButton
			type="button"
			variant="charcoal"
			size="sm"
			onclick={exportToCSV}
			class="font-mono text-xs uppercase"
		>
			Export CSV
		</AdminButton>
	{/snippet}

	{#snippet advancedFilters()}
		<div class="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<AdminSelect
				label="Filter Role"
				name="role"
				value={data.filters.role}
				onchange={(e: any) => {
					const url = new URL(page.url);
					if (e.target.value) url.searchParams.set('role', e.target.value);
					else url.searchParams.delete('role');
					url.searchParams.delete('offset');
					goto(url.pathname + url.search, { invalidateAll: true });
				}}
			>
				<option value="">All Roles</option>
				<option value="customerUser">Customer</option>
				<option value="adminUser">Administrator</option>
			</AdminSelect>

			<AdminSelect
				label="Filter Status"
				name="banned"
				value={data.filters.banned}
				onchange={(e: any) => {
					const url = new URL(page.url);
					if (e.target.value) url.searchParams.set('banned', e.target.value);
					else url.searchParams.delete('banned');
					url.searchParams.delete('offset');
					goto(url.pathname + url.search, { invalidateAll: true });
				}}
			>
				<option value="">All Statuses</option>
				<option value="false">Active Only</option>
				<option value="true">Suspended Only</option>
			</AdminSelect>

			<AdminSelect
				label="Auth Provider"
				name="provider"
				value={data.filters.provider}
				onchange={(e: any) => {
					const url = new URL(page.url);
					if (e.target.value) url.searchParams.set('provider', e.target.value);
					else url.searchParams.delete('provider');
					url.searchParams.delete('offset');
					goto(url.pathname + url.search, { invalidateAll: true });
				}}
			>
				<option value="">All Providers</option>
				<option value="google">Google Link</option>
				<option value="phone">Phone OTP</option>
				<option value="anonymous">Anonymous User</option>
			</AdminSelect>

			<div class="grid grid-cols-2 gap-2">
				<label class="flex flex-col gap-1.5">
					<span class="font-sans text-xs font-semibold text-ash/90">Registered After</span>
					<input
						type="date"
						value={data.filters.createdAfter}
						onchange={(e: any) => {
							const url = new URL(page.url);
							if (e.target.value) url.searchParams.set('createdAfter', e.target.value);
							else url.searchParams.delete('createdAfter');
							url.searchParams.delete('offset');
							goto(url.pathname + url.search, { invalidateAll: true });
						}}
						class="w-full border border-ash/30 bg-void px-3 py-1.5 font-sans text-sm text-bone outline-none focus:border-volt"
					/>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="font-sans text-xs font-semibold text-ash/90">Registered Before</span>
					<input
						type="date"
						value={data.filters.createdBefore}
						onchange={(e: any) => {
							const url = new URL(page.url);
							if (e.target.value) url.searchParams.set('createdBefore', e.target.value);
							else url.searchParams.delete('createdBefore');
							url.searchParams.delete('offset');
							goto(url.pathname + url.search, { invalidateAll: true });
						}}
						class="w-full border border-ash/30 bg-void px-3 py-1.5 font-sans text-sm text-bone outline-none focus:border-volt"
					/>
				</label>
			</div>
		</div>
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
				<span
					class="border px-2 py-0.5 font-mono text-[9px] tracking-wider uppercase {userRow.role ===
					'adminUser'
						? 'border-volt/20 bg-volt/10 font-semibold text-volt'
						: 'border-charcoal bg-charcoal/50 text-ash'}"
				>
					{userRow.role === 'adminUser' ? 'ADMIN' : 'CUSTOMER'}
				</span>
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
				<span
					class="font-mono text-[9px] font-semibold tracking-wider uppercase {userRow.isBanned
						? 'text-red-400'
						: 'text-volt'}"
				>
					{userRow.isBanned ? 'SUSPENDED' : 'ACTIVE'}
				</span>
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
			<td class="px-5 py-4">
				<div class="flex items-center justify-end gap-2">
					<AdminButton
						type="button"
						variant="volt"
						size="sm"
						onclick={() => selectUser(userRow.id)}
						class="min-h-0 py-1 font-mono text-[10px] tracking-wider uppercase"
					>
						Manage
					</AdminButton>

					<div class="user-dropdown-container relative inline-block text-left">
						<AdminButton
							type="button"
							variant="charcoal"
							size="icon"
							onclick={(e) => toggleDropdown(userRow.id, e)}
							title="More actions"
							class="flex h-[28px] w-[28px] items-center justify-center border border-ash/20 bg-charcoal p-0 text-ash transition-all hover:border-ash/50 hover:text-bone"
						>
							<span class="sr-only">More actions</span>
							<svg
								class="h-3.5 w-3.5"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<circle cx="12" cy="12" r="1.5"></circle>
								<circle cx="19" cy="12" r="1.5"></circle>
								<circle cx="5" cy="12" r="1.5"></circle>
							</svg>
						</AdminButton>

						{#if activeDropdownUserId === userRow.id}
							<div
								class="absolute right-0 z-40 mt-1 w-44 origin-top-right divide-y divide-ash/10 border border-ash/20 bg-void shadow-xl focus:outline-none"
								role="menu"
								aria-orientation="vertical"
							>
								<div class="py-1" role="none">
									<button
										type="button"
										onclick={() => {
											activeDropdownUserId = null;
											pendingRoleData = {
												userId: userRow.id,
												userName: userRow.name || 'Anonymous User',
												currentRole: userRow.role,
												targetRole: userRow.role === 'adminUser' ? 'customerUser' : 'adminUser'
											};
											roleConfirmOpen = true;
										}}
										class="flex w-full items-center px-4 py-2 text-left font-mono text-[10px] tracking-wider text-ash uppercase transition-colors hover:bg-charcoal/30 hover:text-bone"
										role="menuitem"
									>
										Toggle Role
									</button>
								</div>
								<div class="py-1" role="none">
									{#if userRow.isBanned}
										<button
											type="button"
											onclick={() => {
												activeDropdownUserId = null;
												triggerLiftSuspension(userRow.id, userRow.name || 'Anonymous User');
											}}
											class="flex w-full items-center px-4 py-2 text-left font-mono text-[10px] tracking-wider text-volt uppercase transition-colors hover:bg-volt/5"
											role="menuitem"
										>
											Unsuspend
										</button>
									{:else}
										<button
											type="button"
											onclick={() => {
												activeDropdownUserId = null;
												triggerSuspendUser(userRow.id, userRow.name || 'Anonymous User');
											}}
											class="flex w-full items-center px-4 py-2 text-left font-mono text-[10px] tracking-wider text-red-400 uppercase transition-colors hover:bg-red-500/5"
											role="menuitem"
										>
											Suspend
										</button>
									{/if}
								</div>
								{#if userRow.sessionCount > 0}
									<div class="py-1" role="none">
										<button
											type="button"
											onclick={() => {
												activeDropdownUserId = null;
												triggerRevokeSessions(userRow.id, userRow.name || 'Anonymous User');
											}}
											class="flex w-full items-center px-4 py-2 text-left font-mono text-[10px] tracking-wider text-red-400 uppercase transition-colors hover:bg-red-500/5"
											role="menuitem"
										>
											Revoke Sessions
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</td>
		</tr>
	{/snippet}

	{#snippet card(userRow)}
		<AdminCard>
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
							<span
								class="border px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider uppercase {userRow.isBanned
									? 'border-red-500/20 bg-red-500/10 text-red-400'
									: 'border-volt/20 bg-volt/10 text-volt'}"
							>
								{userRow.isBanned ? 'Suspended' : 'Active'}
							</span>

							<!-- Auth Methods Badges -->
							{#each userRow.authMethods || [] as method}
								<span
									class="border border-ash/20 bg-void/50 px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-ash uppercase"
								>
									{method.type === 'anonymous' ? 'GUEST' : method.type}
								</span>
							{/each}

							<!-- Sessions Badge -->
							<span
								class="border border-ash/20 bg-void/50 px-1.5 py-0.5 font-mono text-[8px] tracking-wider text-bone uppercase"
							>
								{userRow.sessionCount}
								{userRow.sessionCount === 1 ? 'Session' : 'Sessions'}
							</span>
						</div>
					</div>
				</div>
				<span
					class="border px-2 py-0.5 font-mono text-[9px] uppercase {userRow.role === 'adminUser'
						? 'border-volt/20 bg-volt/10 font-semibold text-volt'
						: 'border-charcoal bg-charcoal/50 text-ash'}"
				>
					{userRow.role === 'adminUser' ? 'Admin' : 'Customer'}
				</span>
			</div>

			<div
				class="mt-4 flex flex-col gap-2 border-t border-ash/10 pt-3 font-mono text-[10px] text-ash"
			>
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
			</div>

			<div class="mt-4 flex items-center justify-end gap-2 border-t border-ash/10 pt-3">
				<AdminButton
					type="button"
					variant="volt"
					size="sm"
					onclick={() => selectUser(userRow.id)}
					class="min-h-0 py-1 font-mono text-[10px] tracking-wider uppercase"
				>
					Manage
				</AdminButton>

				<div class="user-dropdown-container relative inline-block text-left">
					<AdminButton
						type="button"
						variant="charcoal"
						size="icon"
						onclick={(e) => toggleDropdown(userRow.id, e)}
						title="More actions"
						class="flex h-[28px] w-[28px] items-center justify-center border border-ash/20 bg-charcoal p-0 text-ash transition-all hover:border-ash/50 hover:text-bone"
					>
						<span class="sr-only">More actions</span>
						<svg
							class="h-3.5 w-3.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="1.5"></circle>
							<circle cx="19" cy="12" r="1.5"></circle>
							<circle cx="5" cy="12" r="1.5"></circle>
						</svg>
					</AdminButton>

					{#if activeDropdownUserId === userRow.id}
						<div
							class="absolute right-0 z-40 mt-1 w-44 origin-top-right divide-y divide-ash/10 border border-ash/20 bg-void shadow-xl focus:outline-none"
							role="menu"
							aria-orientation="vertical"
						>
							<div class="py-1" role="none">
								<button
									type="button"
									onclick={() => {
										activeDropdownUserId = null;
										pendingRoleData = {
											userId: userRow.id,
											userName: userRow.name || 'Anonymous User',
											currentRole: userRow.role,
											targetRole: userRow.role === 'adminUser' ? 'customerUser' : 'adminUser'
										};
										roleConfirmOpen = true;
									}}
									class="flex w-full items-center px-4 py-2 text-left font-mono text-[10px] tracking-wider text-ash uppercase transition-colors hover:bg-charcoal/30 hover:text-bone"
									role="menuitem"
								>
									Toggle Role
								</button>
							</div>
							<div class="py-1" role="none">
								{#if userRow.isBanned}
									<button
										type="button"
										onclick={() => {
											activeDropdownUserId = null;
											triggerLiftSuspension(userRow.id, userRow.name || 'Anonymous User');
										}}
										class="flex w-full items-center px-4 py-2 text-left font-mono text-[10px] tracking-wider text-volt uppercase transition-colors hover:bg-volt/5"
										role="menuitem"
									>
										Unsuspend
									</button>
								{:else}
									<button
										type="button"
										onclick={() => {
											activeDropdownUserId = null;
											triggerSuspendUser(userRow.id, userRow.name || 'Anonymous User');
										}}
										class="flex w-full items-center px-4 py-2 text-left font-mono text-[10px] tracking-wider text-red-400 uppercase transition-colors hover:bg-red-500/5"
										role="menuitem"
									>
										Suspend
									</button>
								{/if}
							</div>
							{#if userRow.sessionCount > 0}
								<div class="py-1" role="none">
									<button
										type="button"
										onclick={() => {
											activeDropdownUserId = null;
											triggerRevokeSessions(userRow.id, userRow.name || 'Anonymous User');
										}}
										class="flex w-full items-center px-4 py-2 text-left font-mono text-[10px] tracking-wider text-red-400 uppercase transition-colors hover:bg-red-500/5"
										role="menuitem"
									>
										Revoke Sessions
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</AdminCard>
	{/snippet}

	{#snippet emptyState()}
		<p class="font-display text-4xl text-bone uppercase">No users found</p>
		<p class="mt-2 font-sans text-xs text-ash">
			Adjust your queries or filters to look for users database rows.
		</p>
	{/snippet}
</AdminListLayout>

<!-- USER DETAILS DRAWER -->
<Dialog.Root
	bind:open={userDrawerOpen}
	onOpenChange={(open) => {
		if (!open) closeUserDrawer();
	}}
>
	{#if userDrawerOpen && data.selectedUser}
		{@const selectedUser = data.selectedUser}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-50 bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div
				class="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl border-l border-charcoal bg-charcoal shadow-2xl outline-none"
			>
				<Dialog.Content class="w-full">
					{#snippet child({ props })}
						<div
							{...props}
							transition:fade={{ duration: 150 }}
							class="flex h-full flex-col justify-between overflow-y-auto p-6"
						>
							<!-- Header -->
							<div>
								<div class="flex items-start justify-between border-b border-ash/10 pb-4">
									<div class="flex items-center gap-4">
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
											<p class="font-mono text-[9px] tracking-[0.2em] text-volt uppercase">
												Management
											</p>
											<Dialog.Title
												class="mt-1 font-display text-3xl leading-none text-bone uppercase"
											>
												{selectedUser.name || 'Anonymous User'}
											</Dialog.Title>
											<p class="mt-1 font-sans text-xs text-ash">
												{selectedUser.email || 'No email address registered'}
											</p>
										</div>
									</div>
									<button
										type="button"
										onclick={closeUserDrawer}
										class="text-ash/60 transition-colors hover:text-bone"
										aria-label="Close"
									>
										<X size={20} />
									</button>
								</div>

								<Dialog.Description class="sr-only">
									User account management details, auth keys, sessions, and ban panels.
								</Dialog.Description>

								<div class="mt-6 flex flex-col gap-6">
									<!-- Info Grid -->
									<div
										class="grid grid-cols-2 gap-4 rounded-[2px] border border-ash/5 bg-void/50 p-4"
									>
										<div class="font-mono text-[10px] text-ash uppercase">
											<span>User ID:</span>
											<p class="mt-1 font-mono text-xs font-semibold text-bone select-all">
												{selectedUser.id}
											</p>
										</div>
										<div class="font-mono text-[10px] text-ash uppercase">
											<span>Role:</span>
											<div class="mt-1 flex items-center gap-2">
												<span class="text-xs font-semibold text-volt"
													>{selectedUser.role === 'adminUser' ? 'ADMINISTRATOR' : 'CUSTOMER'}</span
												>
												<AdminButton
													type="button"
													variant="outline"
													size="sm"
													onclick={() => {
														pendingRoleData = {
															userId: selectedUser.id,
															userName: selectedUser.name || 'Anonymous User',
															currentRole: selectedUser.role || 'customerUser',
															targetRole:
																selectedUser.role === 'adminUser' ? 'customerUser' : 'adminUser'
														};
														roleConfirmOpen = true;
													}}
													class="min-h-0 border-ash/20 px-2 py-0.5 font-mono text-[9px] text-ash uppercase transition-colors hover:border-ash/50 hover:text-bone"
												>
													Change Role
												</AdminButton>
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
									</div>

									<!-- Last Active Details -->
									{#if selectedUser.lastActiveAt}
										<div class="rounded-[2px] border border-ash/5 bg-void/35 p-4">
											<h3
												class="flex items-center gap-1.5 border-b border-ash/10 pb-1.5 font-mono text-[10px] font-semibold tracking-wider text-ash uppercase"
											>
												<Clock size={11} class="text-volt" /> Last Activity Details
											</h3>
											<div class="mt-3 grid grid-cols-2 gap-4">
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
												<div class="col-span-2 font-mono text-[10px] text-ash uppercase">
													<span>Device / User Agent:</span>
													<p class="mt-1 font-sans text-xs leading-normal break-words text-ash/90">
														{selectedUser.lastActiveUserAgent || 'Unknown'}
													</p>
												</div>
											</div>
										</div>
									{/if}

									<!-- Auth Methods -->
									<div>
										<h3
											class="border-b border-ash/10 pb-1.5 font-mono text-[10px] font-semibold tracking-wider text-ash uppercase"
										>
											Linked Credentials
										</h3>
										<div class="mt-3 flex flex-col gap-2">
											{#if selectedUser.authMethods && selectedUser.authMethods.length > 0}
												{#each selectedUser.authMethods as method}
													<div
														class="flex items-center justify-between rounded-[2px] border border-ash/5 bg-void/35 p-3"
													>
														<div>
															<span class="font-mono text-xs font-semibold text-bone uppercase"
																>{method.type}</span
															>
															<p class="mt-1 font-sans text-[11px] text-ash/80 select-all">
																{method.label}
															</p>
														</div>
														<span class="font-mono text-[9px] tracking-widest text-ash/60">
															LINKED {formatDate(method.linkedAt)}
														</span>
													</div>
												{/each}
											{:else}
												<p class="font-sans text-xs text-ash/60">
													No explicit linked auth methods found.
												</p>
											{/if}

											<!-- Google Temp Email Repair Action -->
											{#if selectedUser.hasInternalEmail && selectedUser.authMethods?.some((m) => m.type === 'google')}
												<div
													class="mt-2 flex items-center justify-between rounded-[2px] border border-volt/20 bg-volt/5 p-4"
												>
													<div class="min-w-0 pr-4">
														<span class="font-mono text-xs font-semibold text-volt"
															>REPAIR EMAIL</span
														>
														<p class="mt-1 font-sans text-[11px] leading-normal text-ash">
															This user has a temporary phone/anonymous email, but holds a linked
															Google account. Upgrade their email to Google profile email.
														</p>
													</div>
													<form method="POST" action="?/repairEmail" use:repairEnhance>
														<input type="hidden" name="userId" value={selectedUser.id} />
														<AdminButton
															type="submit"
															variant="volt"
															size="sm"
															disabled={$repairSubmitting}
														>
															{#if $repairSubmitting}Repairing...{:else}Repair{/if}
														</AdminButton>
													</form>
												</div>
											{/if}
										</div>
									</div>

									<!-- Sessions Management -->
									<div>
										<div class="flex items-center justify-between border-b border-ash/10 pb-1.5">
											<h3
												class="font-mono text-[10px] font-semibold tracking-wider text-ash uppercase"
											>
												Active Sessions
											</h3>
											{#if data.selectedUserSessions && data.selectedUserSessions.length > 0}
												<form
													method="POST"
													action="?/revokeSessions"
													use:revokeEnhance
													onsubmit={(e) => {
														if (
															!confirm(
																'Are you sure you want to terminate ALL active sessions for this user?'
															)
														) {
															e.preventDefault();
														}
													}}
												>
													<input type="hidden" name="userId" value={selectedUser.id} />
													<button
														type="submit"
														class="font-mono text-[9px] tracking-wider text-red-400 uppercase transition-colors hover:text-red-300"
														disabled={$revokeSubmitting}
													>
														Revoke All Sessions
													</button>
												</form>
											{/if}
										</div>

										<div class="mt-3 flex max-h-[220px] flex-col gap-2 overflow-y-auto pr-1">
											{#if data.selectedUserSessions && data.selectedUserSessions.length > 0}
												{#each data.selectedUserSessions as session}
													<div
														class="flex items-center justify-between rounded-[2px] border border-ash/5 bg-void/35 p-3 transition-colors hover:border-ash/10"
													>
														<div class="min-w-0 pr-4">
															<div class="flex items-center gap-2">
																<span class="font-mono text-xs font-semibold text-bone select-all">
																	IP: {session.ipAddress || 'Unknown'}
																</span>
																{#if session.isCurrent}
																	<span
																		class="rounded-[1px] border border-volt/20 bg-volt/10 px-1 py-0.5 font-mono text-[8px] tracking-wider text-volt uppercase"
																	>
																		Active Now
																	</span>
																{/if}
															</div>
															<p
																class="mt-1.5 truncate font-sans text-[10px] text-ash/70"
																title={session.userAgent}
															>
																{session.userAgent || 'No User Agent'}
															</p>
															<p
																class="mt-1 flex items-center gap-1 font-mono text-[9px] text-ash/40"
															>
																<Clock size={12} /> Expires: {formatDate(session.expiresAt)}
															</p>
														</div>

														<form method="POST" action="?/revokeSessions" use:revokeEnhance>
															<input type="hidden" name="userId" value={selectedUser.id} />
															<input type="hidden" name="sessionIds[]" value={session.id} />
															<AdminButton
																type="submit"
																variant="danger"
																size="icon"
																disabled={$revokeSubmitting}
																title="Terminate session"
															>
																<LogOut size={12} />
															</AdminButton>
														</form>
													</div>
												{/each}
											{:else}
												<p class="font-sans text-xs text-ash/60">No active sessions found.</p>
											{/if}
										</div>
									</div>

									<!-- Suspended / Ban Controls -->
									<div class="border-t border-ash/10 pt-5">
										{#if selectedUser.isBanned}
											<!-- Suspended User Card -->
											<div class="rounded-[2px] border border-red-500/20 bg-red-500/5 p-4">
												<div class="flex items-start gap-3">
													<AlertTriangle class="mt-0.5 flex-shrink-0 text-red-400" size={18} />
													<div>
														<h4 class="font-mono text-xs font-semibold text-red-400 uppercase">
															Account Suspended
														</h4>
														<p class="mt-2 font-sans text-xs leading-relaxed text-ash/85">
															<strong>Reason:</strong>
															{selectedUser.banReason || 'No reason provided.'}
														</p>
														<p class="mt-1 font-sans text-xs text-ash/80">
															<strong>Expires:</strong>
															{selectedUser.banExpires
																? formatDate(selectedUser.banExpires)
																: 'Permanent ban'}
														</p>

														<form method="POST" action="?/unban" use:unbanEnhance class="mt-4">
															<input type="hidden" name="userId" value={selectedUser.id} />
															<AdminButton
																type="submit"
																variant="volt"
																size="sm"
																class="font-mono text-xs uppercase"
																disabled={$unbanSubmitting}
															>
																{#if $unbanSubmitting}Lifting...{:else}Lift Suspension{/if}
															</AdminButton>
														</form>
													</div>
												</div>
											</div>
										{:else}
											<!-- Suspend User Form -->
											<form
												method="POST"
												action="?/ban"
												use:banEnhance
												class="flex flex-col gap-4 rounded-[2px] border border-ash/10 bg-void/10 p-4"
											>
												<h4
													class="font-mono text-xs font-semibold tracking-wider text-ash uppercase"
												>
													Suspend User Account
												</h4>

												<input type="hidden" name="userId" value={selectedUser.id} />

												<label class="grid gap-1">
													<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
														>Reason for Suspension</span
													>
													<textarea
														name="reason"
														bind:value={$banForm.reason}
														placeholder="Internal reason or policy violation details..."
														class="min-h-[70px] w-full border border-ash/30 bg-void px-3 py-2 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
													></textarea>
													{#if $banErrors.reason}
														<span class="mt-0.5 font-sans text-xs text-red-400">
															{$banErrors.reason[0]}
														</span>
													{/if}
												</label>

												<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
													<label class="flex flex-col gap-1.5">
														<span class="font-sans text-xs font-semibold text-ash/90"
															>Ban Expiration (Optional)</span
														>
														<input
															type="datetime-local"
															name="expiresAt"
															bind:value={$banForm.expiresAt}
															class="w-full border border-ash/30 bg-void px-3 py-1.5 font-sans text-sm text-bone outline-none focus:border-volt"
														/>
														{#if $banErrors.expiresAt}
															<span class="mt-0.5 font-sans text-xs text-red-400">
																{$banErrors.expiresAt[0]}
															</span>
														{/if}
													</label>

													<div class="flex h-full items-center pt-6">
														<AdminToggle
															label="Terminate Active Sessions"
															description="Forces immediate logout on all devices"
															name="revokeSessions"
															bind:checked={$banForm.revokeSessions}
														/>
													</div>
												</div>

												<AdminButton
													type="submit"
													variant="danger"
													class="mt-2 w-full font-mono text-xs uppercase"
													disabled={$banSubmitting}
												>
													{#if $banSubmitting}Suspending...{:else}Suspend User Account{/if}
												</AdminButton>
											</form>
										{/if}
									</div>
								</div>
							</div>

							<!-- Footer -->
							<div class="mt-8 flex justify-end border-t border-ash/10 pt-4">
								<AdminButton type="button" variant="outline" onclick={closeUserDrawer}>
									Close Details
								</AdminButton>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<!-- ROLE SWAP CONFIRMATION DIALOG -->
<Dialog.Root bind:open={roleConfirmOpen}>
	{#if roleConfirmOpen && pendingRoleData}
		{@const pending = pendingRoleData}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-[100] bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div class="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<Dialog.Content
					class="w-full max-w-md rounded-[2px] border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
				>
					{#snippet child({ props })}
						<div {...props} transition:fade={{ duration: 150 }} class="space-y-6">
							<div>
								<div class="mb-2 flex items-center gap-3 text-volt">
									<ShieldAlert size={20} />
									<Dialog.Title class="font-display text-2xl text-bone uppercase">
										Confirm Role Change
									</Dialog.Title>
								</div>
								<Dialog.Description class="mt-2 font-sans text-xs leading-relaxed text-ash">
									Are you sure you want to change the role of <strong>{pending.userName}</strong>?
									This will modify their permissions immediately.
								</Dialog.Description>
							</div>

							<div
								class="space-y-1 rounded-[2px] border border-ash/10 bg-void/50 p-4 font-mono text-[10px]"
							>
								<div>
									<span class="text-ash uppercase">User:</span>
									<span class="ml-2 font-semibold text-bone">{pending.userName}</span>
								</div>
								<div>
									<span class="text-ash uppercase">Current Role:</span>
									<span class="ml-2 font-semibold text-red-400 uppercase">
										{pending.currentRole === 'adminUser' ? 'Admin' : 'Customer'}
									</span>
								</div>
								<div>
									<span class="text-ash uppercase">New Role:</span>
									<span class="ml-2 font-semibold text-volt uppercase">
										{pending.targetRole === 'adminUser' ? 'Admin' : 'Customer'}
									</span>
								</div>
							</div>

							<div class="flex justify-end gap-3 pt-2">
								<AdminButton
									type="button"
									variant="charcoal"
									onclick={() => (roleConfirmOpen = false)}
								>
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
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<!-- SUSPEND USER DIALOG -->
<Dialog.Root bind:open={suspendModalOpen}>
	{#if suspendModalOpen && pendingSuspendUser}
		{@const pending = pendingSuspendUser}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-[100] bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div class="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<Dialog.Content
					class="w-full max-w-lg rounded-[2px] border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
				>
					{#snippet child({ props })}
						<div {...props} transition:fade={{ duration: 150 }} class="space-y-6">
							<div>
								<div class="mb-2 flex items-center gap-3 text-red-500">
									<Ban size={20} />
									<Dialog.Title class="font-display text-2xl text-bone uppercase">
										Suspend User Account
									</Dialog.Title>
								</div>
								<Dialog.Description class="mt-2 font-sans text-xs leading-relaxed text-ash">
									Suspend access to the store for <strong>{pending.name}</strong>.
								</Dialog.Description>
							</div>

							<form method="POST" action="?/ban" use:banEnhance class="flex flex-col gap-4">
								<input type="hidden" name="userId" value={pending.id} />

								<label class="grid gap-1">
									<span class="font-sans text-xs font-semibold tracking-wide text-ash/90"
										>Reason for Suspension</span
									>
									<textarea
										name="reason"
										bind:value={$banForm.reason}
										placeholder="Internal reason or policy violation details..."
										class="min-h-[70px] w-full border border-ash/30 bg-void px-3 py-2 font-sans text-sm text-bone placeholder-ash/45 transition-colors outline-none hover:border-ash/60 focus:border-volt"
									></textarea>
									{#if $banErrors.reason}
										<span class="mt-0.5 font-sans text-xs text-red-400">
											{$banErrors.reason[0]}
										</span>
									{/if}
								</label>

								<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<label class="flex flex-col gap-1.5">
										<span class="font-sans text-xs font-semibold text-ash/90"
											>Ban Expiration (Optional)</span
										>
										<input
											type="datetime-local"
											name="expiresAt"
											bind:value={$banForm.expiresAt}
											class="w-full border border-ash/30 bg-void px-3 py-1.5 font-sans text-sm text-bone outline-none focus:border-volt"
										/>
										{#if $banErrors.expiresAt}
											<span class="mt-0.5 font-sans text-xs text-red-400">
												{$banErrors.expiresAt[0]}
											</span>
										{/if}
									</label>

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
									<AdminButton
										type="button"
										variant="charcoal"
										onclick={() => (suspendModalOpen = false)}
									>
										Cancel
									</AdminButton>
									<AdminButton type="submit" variant="danger" disabled={$banSubmitting}>
										{#if $banSubmitting}Suspending...{:else}Suspend Account{/if}
									</AdminButton>
								</div>
							</form>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<!-- LIFT SUSPENSION CONFIRMATION DIALOG -->
<Dialog.Root bind:open={unbanConfirmOpen}>
	{#if unbanConfirmOpen && pendingUnbanUser}
		{@const pending = pendingUnbanUser}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-[100] bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div class="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<Dialog.Content
					class="w-full max-w-md rounded-[2px] border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
				>
					{#snippet child({ props })}
						<div {...props} transition:fade={{ duration: 150 }} class="space-y-6">
							<div>
								<div class="mb-2 flex items-center gap-3 text-volt">
									<UserCheck size={20} />
									<Dialog.Title class="font-display text-2xl text-bone uppercase">
										Lift Suspension
									</Dialog.Title>
								</div>
								<Dialog.Description class="mt-2 font-sans text-xs leading-relaxed text-ash">
									Are you sure you want to lift the suspension for <strong>{pending.name}</strong>?
									They will regain access to their account immediately.
								</Dialog.Description>
							</div>

							<div class="flex justify-end gap-3 pt-2">
								<AdminButton
									type="button"
									variant="charcoal"
									onclick={() => (unbanConfirmOpen = false)}
								>
									Cancel
								</AdminButton>
								<form method="POST" action="?/unban" use:unbanEnhance class="inline-block">
									<input type="hidden" name="userId" value={pending.id} />
									<AdminButton type="submit" variant="volt" disabled={$unbanSubmitting}>
										Confirm Lift
									</AdminButton>
								</form>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>

<!-- REVOKE SESSIONS CONFIRMATION DIALOG -->
<Dialog.Root bind:open={revokeConfirmOpen}>
	{#if revokeConfirmOpen && pendingRevokeUser}
		{@const pending = pendingRevokeUser}
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div
						{...props}
						transition:fade={{ duration: 150 }}
						class="fixed inset-0 z-[100] bg-void/85 backdrop-blur-sm"
					></div>
				{/snippet}
			</Dialog.Overlay>

			<div class="fixed inset-0 z-[101] flex items-center justify-center p-4">
				<Dialog.Content
					class="w-full max-w-md rounded-[2px] border border-ash/20 bg-charcoal p-6 shadow-2xl outline-none"
				>
					{#snippet child({ props })}
						<div {...props} transition:fade={{ duration: 150 }} class="space-y-6">
							<div>
								<div class="mb-2 flex items-center gap-3 text-red-500">
									<LogOut size={20} />
									<Dialog.Title class="font-display text-2xl text-bone uppercase">
										Revoke Active Sessions
									</Dialog.Title>
								</div>
								<Dialog.Description class="mt-2 font-sans text-xs leading-relaxed text-ash">
									Are you sure you want to terminate <strong>ALL</strong> active sessions for
									<strong>{pending.name}</strong>? This will force-logout the user on all devices.
								</Dialog.Description>
							</div>

							<div class="flex justify-end gap-3 pt-2">
								<AdminButton
									type="button"
									variant="charcoal"
									onclick={() => (revokeConfirmOpen = false)}
								>
									Cancel
								</AdminButton>
								<form
									method="POST"
									action="?/revokeSessions"
									use:revokeEnhance
									class="inline-block"
								>
									<input type="hidden" name="userId" value={pending.id} />
									<AdminButton type="submit" variant="danger" disabled={$revokeSubmitting}>
										Confirm Logout
									</AdminButton>
								</form>
							</div>
						</div>
					{/snippet}
				</Dialog.Content>
			</div>
		</Dialog.Portal>
	{/if}
</Dialog.Root>
