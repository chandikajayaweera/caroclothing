<script lang="ts">
	import { fade } from 'svelte/transition';
</script>

<footer 
	in:fade={{ duration: 1000, delay: 800 }}
	class="mt-auto py-6 md:py-12 w-full flex flex-col items-center justify-center gap-4 md:gap-6 relative z-10 shrink-0"
>
		<div class="flex items-center gap-8">
			<!-- Minimal SVG Icons for social links -->
			<a href="/" class="text-secondary/40 hover:text-primary transition-colors duration-300" aria-label="Instagram">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
			</a>
			<a href="/" class="text-secondary/40 hover:text-primary transition-colors duration-300" aria-label="Twitter">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"></path></svg>
			</a>
			<a href="/" class="text-secondary/40 hover:text-primary transition-colors duration-300" aria-label="Pinterest">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.23 2.62 7.84 6.36 9.3-.09-.79-.17-2 .03-2.87.18-.8 1.18-5.02 1.18-5.02s-.3-.6-.3-1.5c0-1.4.81-2.45 1.83-2.45.86 0 1.28.65 1.28 1.42 0 .87-.55 2.17-.84 3.38-.24 1.01.5 1.83 1.5 1.83 1.8 0 3.19-1.9 3.19-4.63 0-2.42-1.74-4.11-4.22-4.11-2.85 0-4.52 2.13-4.52 4.33 0 .86.33 1.78.74 2.27.08.1.09.18.06.3-.08.35-.27 1.1-.31 1.27-.05.18-.18.22-.38.13-1.42-.66-2.31-2.73-2.31-4.4 0-3.58 2.6-6.87 7.5-6.87 3.93 0 6.99 2.8 6.99 6.54 0 3.91-2.46 7.05-5.88 7.05-1.15 0-2.23-.6-2.6-1.3l-.71 2.69c-.25.98-.94 2.22-1.4 2.97 1.15.35 2.37.54 3.64.54 5.52 0 10-4.48 10-10S17.52 2 12 2z"></path></svg>
			</a>
		</div>
		<div class="flex flex-col items-center gap-2 mt-2">
			<p class="text-[10px] md:text-xs text-secondary/40 font-mono tracking-widest uppercase text-center">
				&copy; {new Date().getFullYear()} Caro Clothing. All rights reserved.
			</p>
			<p class="text-[10px] text-secondary/30 font-mono tracking-wider uppercase">
				Developed by <a href="https://chandika.dev" target="_blank" rel="noopener noreferrer" class="hover:text-primary transition-colors duration-300 underline decoration-secondary/20 underline-offset-4">Chandika Jayaweera</a>
			</p>
		</div>
	</footer>
