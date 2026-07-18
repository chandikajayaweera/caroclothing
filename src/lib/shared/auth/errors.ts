/**
 * Maps Better Auth error codes and OAuth error params to user-facing messages.
 * Shared between server load functions and client error parsing.
 */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
	account_already_linked_to_different_user:
		'This Google account is already linked to a different account.',
	unable_to_link_account: 'Unable to link this account. Please try again.'
};

export function mapOAuthErrorToMessage(errorParam: string): string {
	return (
		OAUTH_ERROR_MESSAGES[errorParam] ??
		'An error occurred while linking your account. Please try again.'
	);
}
