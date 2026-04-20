<script lang="ts">
	import { ShoppingBag, Search, Heart, User, Menu, X } from 'lucide-svelte';
	let isMenuOpen = $state(false);
</script>

<header class="sticky top-0 z-50 w-full border-b border-charcoal bg-void/90 backdrop-blur-md">
	<div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
		<!-- Mobile Menu Button -->
		<button class="lg:hidden text-bone" onclick={() => isMenuOpen = !isMenuOpen}>
			{#if isMenuOpen}
				<X size={24} />
			{:else}
				<Menu size={24} />
			{/if}
		</button>

		<!-- Logo -->
		<a href="/" class="shrink-0 text-3xl font-bebas text-bone tracking-wider hover:text-volt transition-colors">
			CARO
		</a>

		<!-- Desktop Navigation -->
		<nav class="hidden lg:block">
			<ul class="flex space-x-8 text-sm font-sans uppercase tracking-wider text-bone">
				<li><a href="/shop" class="hover:text-volt transition-colors">Shop</a></li>
				<li><a href="/shop?filter=new" class="text-volt hover:text-volt/80 transition-colors font-bold">New In</a></li>
				<li><a href="/shop/men" class="hover:text-volt transition-colors">Men</a></li>
				<li><a href="/shop/women" class="hover:text-volt transition-colors">Women</a></li>
				<li><a href="/about" class="hover:text-volt transition-colors">About</a></li>
			</ul>
		</nav>

		<!-- Icons -->
		<div class="flex items-center space-x-4 sm:space-x-6 text-bone">
			<button class="hover:text-volt transition-colors hidden sm:block">
				<Search size={20} />
			</button>
			<a href="/wishlist" class="hover:text-volt transition-colors hidden sm:block">
				<Heart size={20} />
			</a>
			<a href="/account" class="hover:text-volt transition-colors">
				<User size={20} />
			</a>
			<a href="/cart" class="hover:text-volt transition-colors relative flex items-center">
				<ShoppingBag size={20} />
				<span class="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-volt text-[10px] font-mono text-void">
					2
				</span>
			</a>
		</div>
	</div>

	<!-- Mobile Menu overlay -->
	{#if isMenuOpen}
		<div class="absolute w-full bg-void px-4 pt-4 pb-8 border-b border-charcoal lg:hidden">
			<ul class="flex flex-col space-y-6 text-2xl font-bebas tracking-wide">
				<li><a href="/shop" class="block hover:text-volt" onclick={() => isMenuOpen = false}>Shop</a></li>
				<li><a href="/shop?filter=new" class="block text-volt" onclick={() => isMenuOpen = false}>New In</a></li>
				<li><a href="/shop/men" class="block hover:text-volt" onclick={() => isMenuOpen = false}>Men</a></li>
				<li><a href="/shop/women" class="block hover:text-volt" onclick={() => isMenuOpen = false}>Women</a></li>
				<li><a href="/about" class="block hover:text-volt" onclick={() => isMenuOpen = false}>About</a></li>
			</ul>
			<div class="mt-8 pt-6 border-t border-charcoal flex justify-around text-bone">
				<button class="hover:text-volt transition-colors flex flex-col items-center">
					<Search size={24} />
					<span class="text-xs font-sans mt-2">Search</span>
				</button>
				<a href="/wishlist" class="hover:text-volt transition-colors flex flex-col items-center">
					<Heart size={24} />
					<span class="text-xs font-sans mt-2">Wishlist</span>
				</a>
			</div>
		</div>
	{/if}
</header>
