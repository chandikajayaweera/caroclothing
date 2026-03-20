import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { fail } from '@sveltejs/kit';
import { waitlistSchema, serverWaitlistSchema } from '$lib/schemas/waitlist';

export const load = async () => {
	return {
		form: await superValidate(zod4(waitlistSchema))
	};
};

export const actions = {
	default: async ({ request }) => {
		// Validate against the strict server schema (+94XXXXXXXXX)
		const form = await superValidate(request, zod4(serverWaitlistSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		// TODO: persist form.data.phone to your DB / trigger WhatsApp message

		return { form };
	}
};
