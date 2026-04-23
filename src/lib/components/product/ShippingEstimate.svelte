<script lang="ts">
	const info = {
		origin: 'Colombo, Sri Lanka',
		colombo: '1–2 business days',
		other: '3–5 business days',
		freeThreshold: 10000,
		freeThresholdFormatted: 'LKR 10,000'
	};
</script>

<div class="bg-charcoal px-4 py-4 mt-2">
	<span class="font-mono text-[9px] text-volt uppercase tracking-[0.15em] mb-2 block">
		SHIPS FROM COLOMBO
	</span>
	<p class="font-sans text-xs text-bone/70">
		Colombo: {info.colombo} · Other districts: {info.other}
	</p>
	<p class="font-mono text-[9px] text-ash mt-1 uppercase">
		Free shipping over {info.freeThresholdFormatted}
	</p>
</div>
