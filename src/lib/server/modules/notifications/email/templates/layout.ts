import { getClientEnv } from '$lib/client/modules/env';

interface LayoutOptions {
	previewText?: string;
	content: string;
}

export function baseLayout({ previewText = '', content }: LayoutOptions): string {
	const clientEnv = getClientEnv();
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${clientEnv.PUBLIC_APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111827;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&zwnj;&nbsp;</div>` : ''}

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:24px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">${clientEnv.PUBLIC_APP_NAME}</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f3f4f6;background:#fafafa;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
                You received this email because you have an account with ${clientEnv.PUBLIC_APP_NAME}.<br/>
                If you have questions, reply to this email or contact our support team.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
