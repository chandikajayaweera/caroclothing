import { superValidate, setError } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { fail } from '@sveltejs/kit';
import { waitlistSchema, serverWaitlistSchema } from '$lib/server/modules/waitlist/waitlist.zod';
import { addToWaitlist } from '$lib/server/modules/waitlist/waitlist.service';

export const load = async () => {
	return {
		form: await superValidate(zod4(waitlistSchema))
	};
};

export const actions = {
	default: async ({ request }) => {
		const form = await superValidate(request, zod4(serverWaitlistSchema));

		// Schema validation failure — fail() is correct here because the form
		// object at this point is a plain superforms result with no Zod internals
		// attached. SvelteKit can serialize it without issue.
		if (!form.valid) {
			return fail(400, { form });
		}

		const result = await addToWaitlist(form.data.phone);

		if (!result.success) {
			// ── WHY return setError(...) directly, not fail(n, { form: setError(...) }) ──
			//
			// setError() from superforms returns its own serializable response
			// object — it is designed to be returned directly from a SvelteKit
			// action. Wrapping it inside fail() re-packages the form object a
			// second time, which causes SvelteKit's JSON serializer to encounter
			// non-POJO class instances (Zod schema internals stored on the form),
			// producing: "Cannot stringify arbitrary non-POJOs (data..form)".
			//
			// setError() already sets a 400 status internally. The duplicate /
			// DB_ERROR distinction is surfaced through the error message text
			// rather than the HTTP status code.
			if (result.error === 'DUPLICATE') {
				return setError(form, 'phone', 'This number is already on the waitlist.');
			}

			// Real DB error — message is safe; the real cause is already logged
			// server-side in waitlist.service.ts.
			return setError(form, 'phone', 'Something went wrong. Please try again.');
		}

		return { form };
	}
};
