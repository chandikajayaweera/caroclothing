<script lang="ts">
	const info = {
		origin: 'Colombo, Sri Lanka',
		colombo: '1–2 business days',
		other: '3–5 business days',
		freeThreshold: 10000,
		freeThresholdFormatted: 'LKR 10,000'
	};
</script>

<div class="mt-2 bg-charcoal px-4 py-4">
	<span class="mb-2 block font-mono text-[9px] tracking-[0.15em] text-volt uppercase">
		SHIPS FROM COLOMBO
	</span>
	<p class="font-sans text-xs text-bone/70">
		Colombo: {info.colombo} · Other districts: {info.other}
	</p>
	<p class="mt-1 font-mono text-[9px] text-ash uppercase">
		Free shipping over {info.freeThresholdFormatted}
	</p>
</div>
