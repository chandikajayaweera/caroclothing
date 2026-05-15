// Core primitives
export type SmsResult = { ok: true; messageId: string } | { ok: false; error: string };

// Send SMS

export interface SmsSendInput {
	/** E.164 format, e.g. "+94771234567" */
	to: string;
	message: string;
}

// Drop launch

export interface DropLaunchSmsInput {
	/** E.164 format, e.g. "+94771234567" */
	to: string;
	dropName: string;
	dropUrl: string;
}

// text.lk API shapes

export interface TextLkSendPayload {
	recipient: string;
	sender_id: string;
	type: 'plain';
	message: string;
}

export interface TextLkSuccessResponse {
	status: 'success';
	data: unknown;
}

export interface TextLkErrorResponse {
	status: 'error';
	message: string;
}

export type TextLkResponse = TextLkSuccessResponse | TextLkErrorResponse;
