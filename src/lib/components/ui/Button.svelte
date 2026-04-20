<script lang="ts">
	let {
		children,
		variant = 'primary',
		size = 'default',
		class: className = '',
		href = undefined,
		...rest
	} = $props();

	const variantClasses = {
		volt: 'bg-volt text-void border border-volt hover:bg-volt/90 hover:shadow-[0_0_20px_-5px_rgba(200,255,0,0.5)]',
		primary:
			'bg-bone text-void border border-bone hover:bg-bone/90 hover:shadow-[0_0_20px_-5px_rgba(248,245,240,0.4)]',
		secondary: 'bg-charcoal text-bone border border-charcoal hover:bg-charcoal/80',
		outline: 'border border-bone text-bone hover:bg-bone hover:text-void',
		ghost: 'text-bone hover:text-volt bg-transparent'
	};

	const sizeClasses = {
		sm: 'px-4 py-2 text-lg',
		default: 'px-8 py-4 text-xl',
		lg: 'px-12 py-5 text-2xl',
		icon: 'p-3'
	};

	const baseClasses =
		'inline-flex items-center justify-center uppercase font-bebas tracking-wide transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2 focus-visible:ring-offset-void';

	let combinedClasses = $derived(
		`${baseClasses} ${variantClasses[variant as keyof typeof variantClasses]} ${sizeClasses[size as keyof typeof sizeClasses]} ${className}`
	);
</script>

{#if href}
	<a {href} class={combinedClasses} {...rest}>
		{@render children()}
	</a>
{:else}
	<button class={combinedClasses} type={(rest as any).type || 'button'} {...rest}>
		{@render children()}
	</button>
{/if}
