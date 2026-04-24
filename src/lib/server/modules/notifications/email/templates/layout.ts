import { getClientEnv } from '$lib/client/modules/env';

interface LayoutOptions {
	previewText?: string;
	content: string;
}

export function baseLayout({ previewText = '', content }: LayoutOptions): string {
	const clientEnv = getClientEnv();
	const brandColors = {
		void: '#0A0A0A',
		bone: '#F8F5F0',
		charcoal: '#1C1C1C',
		ash: '#B4AFA8',
		volt: '#C8FF00'
	};

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${clientEnv.PUBLIC_APP_NAME}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');
    
    body {
      background-color: ${brandColors.bone};
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      word-spacing: normal;
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${brandColors.bone};font-family:'DM Sans',-apple-system,'Segoe UI',sans-serif;color:${brandColors.void};">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&zwnj;&nbsp;</div>` : ''}

  <table width="100%" cellpadding="0" cellspacing="0" style="background:${brandColors.bone};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${brandColors.bone};border:1px solid ${brandColors.void};overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:${brandColors.void};padding:32px;text-align:center;">
              <span style="color:${brandColors.bone};font-family:'DM Sans',sans-serif;font-size:24px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">${clientEnv.PUBLIC_APP_NAME}</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px;background:${brandColors.void};color:${brandColors.bone};">
              <p style="margin:0 0 16px;font-family:'Space Mono',monospace;font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:0.8;">
                ${clientEnv.PUBLIC_APP_NAME} / Sri Lanka / Est. 2026
              </p>
              <p style="margin:0;font-size:12px;color:${brandColors.bone};line-height:1.6;opacity:0.6;">
                You received this because you have an account with us.<br/>
                Made here. Worn everywhere.
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
